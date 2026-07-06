import { defaultWorkspaceAccount, type DashboardGallery, type UploadJob, type WorkspaceAccount } from './model';

const galleryStorageKey = 'lanterna.dashboard.galleries.v1';
const workspaceStorageKey = 'lanterna.dashboard.workspace.v1';
const uploadJobsStorageKey = 'lanterna.dashboard.uploadJobs.v1';

export function loadStoredGalleries() {
  if (typeof window === 'undefined') return [] as DashboardGallery[];

  try {
    const stored = window.localStorage.getItem(galleryStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as DashboardGallery[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredGalleries(galleries: DashboardGallery[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(galleryStorageKey, JSON.stringify(galleries));
}

export function resetStoredGalleries() {
  if (typeof window === 'undefined') return [] as DashboardGallery[];
  window.localStorage.removeItem(galleryStorageKey);
  return [];
}

export function loadStoredWorkspaceAccount() {
  if (typeof window === 'undefined') return defaultWorkspaceAccount;

  try {
    const stored = window.localStorage.getItem(workspaceStorageKey);
    if (!stored) return defaultWorkspaceAccount;
    return { ...defaultWorkspaceAccount, ...JSON.parse(stored) as Partial<WorkspaceAccount> };
  } catch {
    return defaultWorkspaceAccount;
  }
}

export function saveStoredWorkspaceAccount(workspace: WorkspaceAccount) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workspaceStorageKey, JSON.stringify(workspace));
}

export function resetStoredWorkspaceAccount() {
  if (typeof window === 'undefined') return defaultWorkspaceAccount;
  window.localStorage.removeItem(workspaceStorageKey);
  return defaultWorkspaceAccount;
}

export function loadStoredUploadJobs() {
  if (typeof window === 'undefined') return [] as UploadJob[];

  try {
    const stored = window.localStorage.getItem(uploadJobsStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as UploadJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredUploadJobs(uploadJobs: UploadJob[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(uploadJobsStorageKey, JSON.stringify(uploadJobs));
}

export function resetStoredUploadJobs() {
  if (typeof window === 'undefined') return [] as UploadJob[];
  window.localStorage.removeItem(uploadJobsStorageKey);
  return [];
}
