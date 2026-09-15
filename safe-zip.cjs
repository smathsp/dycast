const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Transform, Writable } = require('stream');
const { pipeline } = require('stream/promises');
const yauzl = require('yauzl');
const yazl = require('yazl');

const DEFAULT_LIMITS = Object.freeze({
  maxEntries: 1000,
  maxEntrySize: 256 * 1024 * 1024,
  maxTotalSize: 1024 * 1024 * 1024,
  maxArchiveSize: 1100 * 1024 * 1024
});

class SafeZipError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SafeZipError';
    this.code = code;
  }
}

function safeZipError(code, message, cause) {
  return new SafeZipError(code, message, cause);
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) return fallback;
  return number;
}

function normalizeLimits(options = {}) {
  return {
    maxEntries: normalizePositiveInteger(options.maxEntries, DEFAULT_LIMITS.maxEntries),
    maxEntrySize: normalizePositiveInteger(options.maxEntrySize, DEFAULT_LIMITS.maxEntrySize),
    maxTotalSize: normalizePositiveInteger(options.maxTotalSize, DEFAULT_LIMITS.maxTotalSize),
    maxArchiveSize: normalizePositiveInteger(options.maxArchiveSize, DEFAULT_LIMITS.maxArchiveSize)
  };
}

function normalizeArchivePath(rawPath) {
  const archivePath = String(rawPath || '');
  if (!archivePath || archivePath.includes('\0')) {
    throw safeZipError('ZIP_INVALID_PATH', '压缩包包含无效路径');
  }
  if (archivePath.includes('\\') || archivePath.startsWith('/') || /^[a-zA-Z]:/.test(archivePath)) {
    throw safeZipError('ZIP_INVALID_PATH', `压缩包路径无效：${archivePath}`);
  }

  const isDirectory = archivePath.endsWith('/');
  const segments = archivePath.split('/');
  if (isDirectory) segments.pop();
  if (!segments.length || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw safeZipError('ZIP_INVALID_PATH', `压缩包路径无效：${archivePath}`);
  }

  const normalized = segments.join('/');
  return isDirectory ? `${normalized}/` : normalized;
}

function canonicalArchivePath(archivePath) {
  return archivePath.replace(/\/$/, '').normalize('NFC').toLowerCase();
}

function validateSize(value, code, message) {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 0) throw safeZipError(code, message);
  return size;
}

function wrapOpenError(error) {
  if (error instanceof SafeZipError) return error;
  const message = String(error?.message || '');
  if (/invalid relative path|absolute path|backslash/i.test(message)) {
    return safeZipError('ZIP_INVALID_PATH', '压缩包包含不安全路径', error);
  }
  return safeZipError('ZIP_INVALID_ARCHIVE', '压缩包损坏或格式无效', error);
}

function openYauzl(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, {
      autoClose: false,
      decodeStrings: true,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true
    }, (error, zipFile) => {
      if (error || !zipFile) reject(wrapOpenError(error));
      else resolve(zipFile);
    });
  });
}

function openEntryStream(zipFile, entry) {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error || new Error('ZIP entry stream unavailable'));
      else resolve(stream);
    });
  });
}

class SafeZipArchive {
  constructor(zipFile, entries, limits) {
    this._zipFile = zipFile;
    this._entries = entries;
    this._limits = limits;
    this._actualTotalSize = 0;
    this._closed = false;
    this._activeRead = false;
    this._zipError = null;
    this._handleZipError = error => { this._zipError = error; };
    zipFile.on('error', this._handleZipError);
  }

  listEntries() {
    return Array.from(this._entries.values(), value => value.info);
  }

  getEntry(rawPath) {
    const archivePath = normalizeArchivePath(rawPath);
    return this._entries.get(archivePath)?.info || null;
  }

  async _pipeEntry(rawPath, destination, maximumSize) {
    if (this._closed) throw safeZipError('ZIP_CLOSED', '压缩包已经关闭');
    if (this._activeRead) throw safeZipError('ZIP_CONCURRENT_READ', '压缩包条目必须按顺序读取');
    if (this._zipError) throw wrapOpenError(this._zipError);

    const archivePath = normalizeArchivePath(rawPath);
    const record = this._entries.get(archivePath);
    if (!record || record.info.isDirectory) {
      throw safeZipError('ZIP_ENTRY_NOT_FOUND', `压缩包缺少文件：${archivePath}`);
    }
    if (record.consumed) {
      throw safeZipError('ZIP_DUPLICATE_READ', `压缩包文件被重复引用：${archivePath}`);
    }

    const maxSize = Math.min(
      this._limits.maxEntrySize,
      normalizePositiveInteger(maximumSize, this._limits.maxEntrySize)
    );
    if (record.info.uncompressedSize > maxSize) {
      throw safeZipError('ZIP_ENTRY_TOO_LARGE', `压缩包文件超过大小限制：${archivePath}`);
    }

    record.consumed = true;
    this._activeRead = true;
    let actualEntrySize = 0;
    try {
      const source = await openEntryStream(this._zipFile, record.entry);
      const limiter = new Transform({
        transform: (chunk, _encoding, callback) => {
          const nextEntrySize = actualEntrySize + chunk.length;
          const nextTotalSize = this._actualTotalSize + chunk.length;
          if (nextEntrySize > maxSize) {
            callback(safeZipError('ZIP_ENTRY_TOO_LARGE', `压缩包文件实际解压大小超过限制：${archivePath}`));
            return;
          }
          if (nextTotalSize > this._limits.maxTotalSize) {
            callback(safeZipError('ZIP_TOTAL_TOO_LARGE', '压缩包实际解压总大小超过限制'));
            return;
          }
          actualEntrySize = nextEntrySize;
          this._actualTotalSize = nextTotalSize;
          callback(null, chunk);
        }
      });
      await pipeline(source, limiter, destination);
      if (actualEntrySize !== record.info.uncompressedSize) {
        throw safeZipError(
          'ZIP_ENTRY_SIZE_MISMATCH',
          `压缩包文件实际大小与目录不一致：${archivePath}`
        );
      }
      return actualEntrySize;
    } catch (error) {
      if (error instanceof SafeZipError) throw error;
      throw safeZipError('ZIP_ENTRY_READ_FAILED', `压缩包文件读取失败：${archivePath}`, error);
    } finally {
      this._activeRead = false;
    }
  }

  async readBuffer(rawPath, options = {}) {
    const chunks = [];
    const collector = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });
    const size = await this._pipeEntry(rawPath, collector, options.maxSize);
    return Buffer.concat(chunks, size);
  }

  async extractToFile(rawPath, targetPath, options = {}) {
    if (this._closed) throw safeZipError('ZIP_CLOSED', '压缩包已经关闭');
    if (this._activeRead) throw safeZipError('ZIP_CONCURRENT_READ', '压缩包条目必须按顺序读取');
    const archivePath = normalizeArchivePath(rawPath);
    const record = this._entries.get(archivePath);
    if (!record || record.info.isDirectory) {
      throw safeZipError('ZIP_ENTRY_NOT_FOUND', `压缩包缺少文件：${archivePath}`);
    }
    if (record.consumed) {
      throw safeZipError('ZIP_DUPLICATE_READ', `压缩包文件被重复引用：${archivePath}`);
    }
    const resolvedTarget = path.resolve(String(targetPath));
    const output = fs.createWriteStream(resolvedTarget, { flags: 'wx', mode: 0o600 });
    try {
      return await this._pipeEntry(archivePath, output, options.maxSize);
    } catch (error) {
      output.destroy();
      try { await fs.promises.unlink(resolvedTarget); } catch {}
      throw error;
    }
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    this._zipFile.removeListener('error', this._handleZipError);
    try { this._zipFile.close(); } catch {}
  }
}

async function openSafeZip(filePath, options = {}) {
  const limits = normalizeLimits(options);
  const resolvedPath = path.resolve(String(filePath));
  const stat = await fs.promises.stat(resolvedPath);
  if (!stat.isFile()) throw safeZipError('ZIP_INVALID_ARCHIVE', '请选择正确的 ZIP 文件');
  if (stat.size > limits.maxArchiveSize) {
    throw safeZipError('ZIP_ARCHIVE_TOO_LARGE', 'ZIP 文件本身超过大小限制');
  }

  const zipFile = await openYauzl(resolvedPath);
  return new Promise((resolve, reject) => {
    const entries = new Map();
    const canonicalPaths = new Set();
    let declaredTotalSize = 0;
    let entryCount = 0;
    let settled = false;

    const cleanup = () => {
      zipFile.removeListener('entry', handleEntry);
      zipFile.removeListener('end', handleEnd);
      zipFile.removeListener('error', handleError);
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      try { zipFile.close(); } catch {}
      reject(wrapOpenError(error));
    };
    const handleEntry = entry => {
      try {
        entryCount += 1;
        if (entryCount > limits.maxEntries) {
          throw safeZipError('ZIP_TOO_MANY_ENTRIES', '压缩包条目数量超过限制');
        }

        const archivePath = normalizeArchivePath(entry.fileName);
        const canonicalPath = canonicalArchivePath(archivePath);
        if (canonicalPaths.has(canonicalPath)) {
          throw safeZipError('ZIP_DUPLICATE_PATH', `压缩包包含重复路径：${archivePath}`);
        }
        canonicalPaths.add(canonicalPath);

        const uncompressedSize = validateSize(
          entry.uncompressedSize,
          'ZIP_INVALID_ENTRY_SIZE',
          `压缩包文件大小无效：${archivePath}`
        );
        const compressedSize = validateSize(
          entry.compressedSize,
          'ZIP_INVALID_ENTRY_SIZE',
          `压缩包文件大小无效：${archivePath}`
        );
        if (uncompressedSize > limits.maxEntrySize) {
          throw safeZipError('ZIP_ENTRY_TOO_LARGE', `压缩包存在超大文件：${archivePath}`);
        }
        declaredTotalSize += uncompressedSize;
        if (!Number.isSafeInteger(declaredTotalSize) || declaredTotalSize > limits.maxTotalSize) {
          throw safeZipError('ZIP_TOTAL_TOO_LARGE', '压缩包解压总大小超过限制');
        }
        if (typeof entry.isEncrypted === 'function' && entry.isEncrypted()) {
          throw safeZipError('ZIP_ENCRYPTED_ENTRY', `压缩包包含加密文件：${archivePath}`);
        }
        if (![0, 8].includes(entry.compressionMethod)) {
          throw safeZipError('ZIP_UNSUPPORTED_COMPRESSION', `压缩包使用了不支持的压缩方式：${archivePath}`);
        }

        const isDirectory = archivePath.endsWith('/');
        const info = Object.freeze({
          archivePath,
          isDirectory,
          uncompressedSize,
          compressedSize,
          compressionMethod: entry.compressionMethod
        });
        entries.set(archivePath, { entry, info, consumed: false });
        zipFile.readEntry();
      } catch (error) {
        fail(error);
      }
    };
    const handleEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(new SafeZipArchive(zipFile, entries, limits));
    };
    const handleError = error => fail(error);

    zipFile.on('entry', handleEntry);
    zipFile.once('end', handleEnd);
    zipFile.once('error', handleError);
    zipFile.readEntry();
  });
}

async function prepareWriteEntries(rawEntries, limits) {
  if (!Array.isArray(rawEntries)) throw safeZipError('ZIP_INVALID_ENTRIES', '压缩包条目无效');
  if (rawEntries.length > limits.maxEntries) {
    throw safeZipError('ZIP_TOO_MANY_ENTRIES', '压缩包条目数量超过限制');
  }

  const canonicalPaths = new Set();
  const prepared = [];
  let totalSize = 0;
  for (const rawEntry of rawEntries) {
    const archivePath = normalizeArchivePath(rawEntry?.archivePath);
    if (archivePath.endsWith('/')) throw safeZipError('ZIP_INVALID_PATH', `文件条目不能是目录：${archivePath}`);
    const canonicalPath = canonicalArchivePath(archivePath);
    if (canonicalPaths.has(canonicalPath)) {
      throw safeZipError('ZIP_DUPLICATE_PATH', `压缩包包含重复路径：${archivePath}`);
    }
    canonicalPaths.add(canonicalPath);

    let preparedEntry;
    let size;
    if (rawEntry?.filePath != null) {
      const filePath = path.resolve(String(rawEntry.filePath));
      const stat = await fs.promises.lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw safeZipError('ZIP_INVALID_SOURCE', `压缩包来源不是普通文件：${archivePath}`);
      }
      size = validateSize(stat.size, 'ZIP_INVALID_ENTRY_SIZE', `文件大小无效：${archivePath}`);
      preparedEntry = { archivePath, filePath, stat };
    } else if (rawEntry?.data != null) {
      const data = Buffer.isBuffer(rawEntry.data) ? rawEntry.data : Buffer.from(rawEntry.data);
      size = data.length;
      preparedEntry = { archivePath, data };
    } else {
      throw safeZipError('ZIP_INVALID_SOURCE', `压缩包条目缺少内容：${archivePath}`);
    }

    if (size > limits.maxEntrySize) {
      throw safeZipError('ZIP_ENTRY_TOO_LARGE', `压缩包存在超大文件：${archivePath}`);
    }
    totalSize += size;
    if (!Number.isSafeInteger(totalSize) || totalSize > limits.maxTotalSize) {
      throw safeZipError('ZIP_TOTAL_TOO_LARGE', '压缩包总大小超过限制');
    }
    prepared.push(preparedEntry);
  }
  return prepared;
}

function addPreparedEntries(zipFile, preparedEntries) {
  for (const entry of preparedEntries) {
    if (entry.filePath) {
      zipFile.addFile(entry.filePath, entry.archivePath, {
        mtime: entry.stat.mtime,
        mode: entry.stat.mode
      });
    } else {
      zipFile.addBuffer(entry.data, entry.archivePath);
    }
  }
}

function createArchiveSizeLimiter(maximumSize) {
  let totalSize = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      totalSize += chunk.length;
      if (!Number.isSafeInteger(totalSize) || totalSize > maximumSize) {
        callback(safeZipError('ZIP_ARCHIVE_TOO_LARGE', '生成的 ZIP 文件超过大小限制'));
        return;
      }
      callback(null, chunk);
    }
  });
}

async function writeSafeZipBuffer(entries, options = {}) {
  const limits = normalizeLimits(options);
  const preparedEntries = await prepareWriteEntries(entries, limits);
  const zipFile = new yazl.ZipFile();
  const chunks = [];
  let totalSize = 0;
  const collector = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      totalSize += chunk.length;
      callback();
    }
  });

  try {
    addPreparedEntries(zipFile, preparedEntries);
    const completion = pipeline(
      zipFile.outputStream,
      createArchiveSizeLimiter(limits.maxArchiveSize),
      collector
    );
    zipFile.end();
    await completion;
    return Buffer.concat(chunks, totalSize);
  } catch (error) {
    zipFile.outputStream.destroy();
    throw error;
  }
}

async function writeSafeZipFile(outputPath, entries, options = {}) {
  const limits = normalizeLimits(options);
  const preparedEntries = await prepareWriteEntries(entries, limits);
  const resolvedOutput = path.resolve(String(outputPath));
  const temporaryPath = path.join(
    path.dirname(resolvedOutput),
    `.${path.basename(resolvedOutput)}.${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  const zipFile = new yazl.ZipFile();

  try {
    addPreparedEntries(zipFile, preparedEntries);

    const output = fs.createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 });
    const completion = pipeline(
      zipFile.outputStream,
      createArchiveSizeLimiter(limits.maxArchiveSize),
      output
    );
    zipFile.end();
    await completion;
    const archiveStat = await fs.promises.stat(temporaryPath);
    if (archiveStat.size > limits.maxArchiveSize) {
      throw safeZipError('ZIP_ARCHIVE_TOO_LARGE', '生成的 ZIP 文件超过大小限制');
    }
    try {
      await fs.promises.rename(temporaryPath, resolvedOutput);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
      await fs.promises.unlink(resolvedOutput);
      await fs.promises.rename(temporaryPath, resolvedOutput);
    }
    return { entryCount: preparedEntries.length };
  } catch (error) {
    zipFile.outputStream.destroy();
    try { await fs.promises.unlink(temporaryPath); } catch {}
    throw error;
  }
}

module.exports = {
  SafeZipError,
  normalizeArchivePath,
  openSafeZip,
  writeSafeZipBuffer,
  writeSafeZipFile
};
