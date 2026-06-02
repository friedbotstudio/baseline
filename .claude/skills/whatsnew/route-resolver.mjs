// Foundation — resolve the optional per-project routing target.
//
// project.json → whatsnew.route_workflow names a routing workflow that consumes
// the fragment. Absent or null resolves to null (read-time default) so the
// generator still succeeds with no routing target configured.

export function resolveRouteWorkflow(project) {
  const whatsnew = project?.whatsnew;
  if (whatsnew == null) return null;
  const route = whatsnew.route_workflow;
  if (route == null) return null;
  if (typeof route !== 'string') {
    throw new Error('project.json → whatsnew.route_workflow must be a string or null');
  }
  return route;
}
