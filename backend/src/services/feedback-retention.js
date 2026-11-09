const FEEDBACK_RETENTION_DAYS = 365;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function deleteExpiredFeedback(prisma, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('now must be a valid Date.');
  }

  const cutoff = new Date(now.getTime() - FEEDBACK_RETENTION_DAYS * DAY_IN_MILLISECONDS);
  return prisma.feedback.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

module.exports = { deleteExpiredFeedback, FEEDBACK_RETENTION_DAYS };
