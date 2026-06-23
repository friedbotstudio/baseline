// Foundation: the sprint-mode gate. Sprint mode is opt-in and OFF by default
// (the sandbox) — it runs only when velocity.sprint_mode.enabled is explicitly
// true in project.json.

export function isSprintModeEnabled(project) {
  return project?.velocity?.sprint_mode?.enabled === true;
}
