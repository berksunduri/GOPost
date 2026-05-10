function findServiceFromCandidates(candidates) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    if (typeof candidate.ImportData === 'function' && typeof candidate.ExportData === 'function') {
      return candidate;
    }
  }
  return null;
}

export function getAppService() {
  const go = window?.go;
  const candidates = [
    go?.main?.App,
    go?.app?.App,
    go?.App,
    window?.App,
    window?.app?.App,
    window?.wails?.services?.App,
    window?.__wails?.services?.App,
  ];

  const direct = findServiceFromCandidates(candidates);
  if (direct) {
    return direct;
  }

  if (go && typeof go === 'object') {
    for (const namespaceValue of Object.values(go)) {
      if (!namespaceValue || typeof namespaceValue !== 'object') {
        continue;
      }
      const nested = findServiceFromCandidates(Object.values(namespaceValue));
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}
