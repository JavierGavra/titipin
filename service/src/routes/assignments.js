const express = require('express');
const { requireScope } = require('../auth/require-scope');
const { mayReadAssignment } = require('../auth/ownership');
const { resolveActor } = require('../store/identities');
const { validateAssignmentId } = require('../schemas/assignments');
const { getAssignmentById } = require('../store/assignments');
const { toAssignment } = require('../representations/assignments');
const { sendProblem } = require('../problem');

const router = express.Router();

router.get('/:assignmentId', requireScope('requests:read'), async (req, res) => {
  const invalidParameters = validateAssignmentId(
    req.params.assignmentId
  );

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The assignmentId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);
  const row = await getAssignmentById(req.params.assignmentId, actor);

  if (!mayReadAssignment(actor, row)) { // mutation: assignment-owner
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested assignment was not found.',
    });
  }

  return res.status(200).json(toAssignment(row));
});

module.exports = router;