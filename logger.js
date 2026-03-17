function safeStringify(data) {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function formatLog(level, event, data) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] [${event}] - ${safeStringify(data)}`;
}

function logInfo(event, data) {
  console.log(formatLog("INFO", event, data));
}

function logWarn(event, data) {
  console.log(formatLog("WARN", event, data));
}

function logError(event, error) {
  const data = error instanceof Error
    ? { message: error.message, stack: error.stack }
    : error;
  console.error(formatLog("ERROR", event, data));
}

module.exports = { logInfo, logWarn, logError };
