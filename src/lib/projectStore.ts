/**
 * projectStore.ts
 * Lightweight singleton holding the currently active project context.
 * Set on SupplierResponsesPage whenever a project is selected.
 * Read by PricingPage (and others) so they can run jobs independently
 * of the technical analysis flow.
 */

let _projectId: string | null = null;
let _rfpId: string | null = null;
let _projectName: string | null = null;

export const projectStore = {
  setProject(projectId: string, rfpId: string, projectName?: string) {
    _projectId   = projectId;
    _rfpId       = rfpId;
    _projectName = projectName ?? null;
  },
  getProjectId(): string | null {
    return _projectId;
  },
  /** rfp_id == project_id for project-based flows */
  getRfpId(): string | null {
    return _rfpId ?? _projectId;
  },
  getProjectName(): string | null {
    return _projectName;
  },
  clear() {
    _projectId   = null;
    _rfpId       = null;
    _projectName = null;
  },
};
