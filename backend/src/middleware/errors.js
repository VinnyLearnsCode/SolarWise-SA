function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } });
}

function errorHandler(err, _req, res, _next) {
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted values.',
        details: err.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
      }
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' }
    });
  }
  if (['P1000', 'P1001', 'P1002', 'P1003', 'P1010', 'P2021'].includes(err.code)
    || err.name === 'PrismaClientInitializationError') {
    return res.status(503).json({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database-backed services are temporarily unavailable.' }
    });
  }
  if (err.code === 'P2002') {
    return res.status(409).json({ error: { code: 'DUPLICATE_ENTRY', message: 'A record with these unique values already exists.' } });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: { code: 'RECORD_NOT_FOUND', message: 'The requested record was not found.' } });
  }
  console.error(err);
  return res.status(err.status || 500).json({
    error: { code: err.code || 'INTERNAL_ERROR', message: err.status ? err.message : 'An unexpected server error occurred.' }
  });
}

module.exports = { errorHandler, notFound };
