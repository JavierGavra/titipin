const express = require('express');
const { validateAssignmentId } = require('../schemas/assignments');
const { getAssignmentById } = require('../store/assignments');
const { toAssignment } = require('../representations/assignments');
const { sendProblem } = require('../problem');

const router = express.Router();

router.get('/:assignmentId', async (req, res) => {
  const invalidParameters = validateAssignmentId(
    req.params.assignmentId
  );

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The assignmentId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  const row = await getAssignmentById(req.params.assignmentId);

  if (row === null) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested assignment was not found.',
      extensions: {
        resourceType: 'Assignment',
        resourceId: req.params.assignmentId,
      },
    });
  }

  return res.status(200).json(toAssignment(row));
});

module.exports = router;