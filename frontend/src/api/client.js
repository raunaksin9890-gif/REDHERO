function normalizeApiUrl(value) {
  const base = (value || "http://127.0.0.1:8000/api").replace(/\/+$/, "");
  return base.endsWith("/api") ? base : `${base}/api`;
}

const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);

export function getToken() {
  return localStorage.getItem("redhero_access");
}

export function saveSession(payload) {
  localStorage.setItem("redhero_access", payload.access);
  localStorage.setItem("redhero_refresh", payload.refresh);
  localStorage.setItem("redhero_user", JSON.stringify(payload.user));
}

export function clearSession() {
  localStorage.removeItem("redhero_access");
  localStorage.removeItem("redhero_refresh");
  localStorage.removeItem("redhero_user");
}

function currentRole() {
  try {
    return JSON.parse(localStorage.getItem("redhero_user") || "{}").role;
  } catch {
    return undefined;
  }
}

function assertFrontendPermission(path, method) {
  const role = currentRole();
  if (!role || method === "GET") return;
  const writeRules = [
    { pattern: /^\/students\//, roles: ["super_admin"] },
    { pattern: /^\/teachers\//, roles: ["super_admin"] },
    { pattern: /^\/auth\/users\//, roles: ["super_admin"] },
    { pattern: /^\/blogs\//, roles: ["super_admin"] },
    { pattern: /^\/current-affairs\//, roles: ["super_admin"] },
    { pattern: /^\/timetables\//, roles: ["super_admin"] },
    { pattern: /^\/fees\//, roles: ["super_admin"] },
    { pattern: /^\/attendance\//, methods: ["DELETE"], roles: ["super_admin"] },
    { pattern: /^\/attendance\//, methods: ["POST", "PUT"], roles: ["super_admin", "teacher"] },
    { pattern: /^\/marks\//, methods: ["DELETE"], roles: ["super_admin"] },
    { pattern: /^\/marks\//, methods: ["POST", "PUT"], roles: ["super_admin", "teacher"] },
    { pattern: /^\/notes\/[^/]+\/bookmark\//, methods: ["POST", "DELETE"], roles: ["student"] },
    { pattern: /^\/notes\//, roles: ["super_admin", "teacher"] },
    { pattern: /^\/videos\//, roles: ["super_admin", "teacher"] },
    { pattern: /^\/notices\//, roles: ["super_admin", "teacher"] },
    { pattern: /^\/assignments\/[^/]+\/submit\//, roles: ["student"] },
    { pattern: /^\/assignments\//, roles: ["super_admin", "teacher"] },
    { pattern: /^\/question-bank\//, roles: ["super_admin", "teacher"] },
    { pattern: /^\/practice\/daily\//, roles: ["student"] },
    { pattern: /^\/practice\/sessions\/[^/]+\/(answers|submit)\//, roles: ["student"] },
    { pattern: /^\/practice\/mistakes\/[^/]+\/practice-again\//, roles: ["student"] },
    { pattern: /^\/practice\/study-plan\/tasks\/[^/]+\/complete\//, roles: ["student"] },
    { pattern: /^\/practice\//, roles: ["super_admin", "teacher", "student"] },
    { pattern: /^\/exams\/[^/]+\/(start)\//, roles: ["student"] },
    { pattern: /^\/exams\/[^/]+\/(questions|publish-results)\//, roles: ["super_admin", "teacher"] },
    { pattern: /^\/exams\//, roles: ["super_admin", "teacher"] },
    { pattern: /^\/exam-attempts\/[^/]+\/(answers|submit|violation)\//, roles: ["student"] },
    { pattern: /^\/exam-attempts\/[^/]+\/evaluate\//, roles: ["super_admin", "teacher"] },
    { pattern: /^\/notifications\//, roles: ["super_admin", "teacher", "student"] },
    { pattern: /^\/contact-messages\//, methods: ["POST"], roles: ["student"] },
    { pattern: /^\/contact-messages\//, methods: ["PUT"], roles: ["super_admin"] },
    { pattern: /^\/ai\/chat\//, roles: ["student"] },
  ];
  const rule = writeRules.find((item) => item.pattern.test(path) && (!item.methods || item.methods.includes(method)));
  if (rule && !rule.roles.includes(role)) throw new Error("You do not have permission to perform this action");
}

export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  assertFrontendPermission(path, method);
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "RedHero request failed");
  return data;
}

export { API_URL };
