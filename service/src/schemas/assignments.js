function validateAssignmentId(assignmentId) {
  const isString = typeof assignmentId === 'string';
  const length = isString ? Array.from(assignmentId).length : 0;

  if (!isString || length < 8 || length > 64) {
    return [
      {
        name: 'assignmentId',
        location: 'path',
        reason: 'assignmentId must be a string containing 8 to 64 characters.',
      },
    ];
  }

  return [];
}

module.exports = { validateAssignmentId };