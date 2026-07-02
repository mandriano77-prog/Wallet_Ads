/**
 * Geofencing — Apple pass.json locations[] + Google merchantLocations.
 * Apple: lock-screen pass surfacing (not APNs marketing push).
 * Google: Nearby Notifications via class/object merchantLocations (Google-set radius).
 */

const APPLE_MAX_POI = 10;

function parseCoord(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePassLocations(brandConfig = {}) {
  const merged = mergeGeofenceLocationSources(brandConfig?.locations, []);
  if (!merged.length) return [];
  const out = [];
  for (const loc of merged) {
    if (out.length >= APPLE_MAX_POI) break;
    const latitude = parseCoord(loc?.latitude);
    const longitude = parseCoord(loc?.longitude);
    if (latitude == null || longitude == null) continue;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
    const entry = { latitude, longitude };
    const rt = loc.relevantText;
    if (rt != null && String(rt).trim()) entry.relevantText = String(rt).trim().slice(0, 200);
    if (loc.altitude != null && loc.altitude !== '') {
      const alt = parseCoord(loc.altitude);
      if (alt != null) entry.altitude = alt;
    }
    out.push(entry);
  }
  return out;
}

function normalizeGoogleMerchantLocations(brandConfig = {}) {
  return normalizePassLocations(brandConfig).map(({ latitude, longitude }) => ({ latitude, longitude }));
}

function mergeGeofenceLocationSources(brandLocations, hubLocations, limit = APPLE_MAX_POI) {
  const combined = [...(hubLocations || []), ...(brandLocations || [])];
  const seen = new Set();
  const out = [];
  for (const loc of combined) {
    const lat = parseCoord(loc?.latitude);
    const lon = parseCoord(loc?.longitude);
    if (lat == null || lon == null) continue;
    const key = `${lat.toFixed(5)}:${lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...loc, latitude: lat, longitude: lon });
    if (out.length >= limit) break;
  }
  return out;
}

function resolveEffectiveMaxDistanceM(brandConfig = {}) {
  let maxRadius = 500;
  const locs = brandConfig.locations;
  if (Array.isArray(locs)) {
    for (const loc of locs) {
      const r = parseInt(String(loc?.radius), 10);
      if (Number.isFinite(r) && r > maxRadius) maxRadius = r;
    }
  }
  let maxDistanceM = parseInt(String(brandConfig.maxDistance), 10);
  if (!Number.isFinite(maxDistanceM) || maxDistanceM < 1) maxDistanceM = maxRadius;
  return Math.min(Math.max(maxDistanceM, 1), 100000);
}

function minPoiRadiusM(brandConfig = {}) {
  const locs = brandConfig.locations;
  if (!Array.isArray(locs) || !locs.length) return null;
  let min = null;
  for (const loc of locs) {
    const r = parseInt(String(loc?.radius), 10);
    if (!Number.isFinite(r) || r < 1) continue;
    min = min == null ? r : Math.min(min, r);
  }
  return min;
}

function buildGeofenceDiagnostics({
  brandConfig = {},
  hubSettings = {},
  hubMerchantLocations = [],
  appleDevices = 0,
  googleObjects = 0,
  passCount = 0,
} = {}) {
  const geofencingEnabled = hubSettings?.geofencing_enabled !== false;
  const dashboardPois = Array.isArray(brandConfig.locations) ? brandConfig.locations.length : 0;
  const hubMerchantCount = Array.isArray(hubMerchantLocations) ? hubMerchantLocations.length : 0;
  const mergedConfig = applyGeofenceToBrandConfig(brandConfig, {
    hubLocations: hubMerchantLocations,
    geofencingEnabled,
  });
  const appleLocations = normalizePassLocations(mergedConfig);
  const googleLocations = normalizeGoogleMerchantLocations(mergedConfig);
  const effectiveMaxDistanceM = resolveEffectiveMaxDistanceM(brandConfig);
  const smallestPoiRadiusM = minPoiRadiusM(brandConfig);

  // Candidati validi senza il tetto Apple: se superano APPLE_MAX_POI il taglio
  // avviene in silenzio dentro il pass — qui lo rendiamo visibile al manager.
  const candidatePois = mergeGeofenceLocationSources(
    brandConfig.locations,
    geofencingEnabled ? hubMerchantLocations : [],
    Infinity
  ).length;
  const applePoisDropped = Math.max(0, candidatePois - appleLocations.length);

  const notes = [];
  if (applePoisDropped > 0) {
    notes.push(
      `⚠️ ${applePoisDropped} POI oltre il limite Apple di ${APPLE_MAX_POI} — esclusi dal pass (priorità: merchant HUB, poi sedi brand, in ordine di inserimento).`
    );
    console.warn(`[geofencing] ${candidatePois} POI candidati: ${applePoisDropped} esclusi dal pass Apple (limite ${APPLE_MAX_POI})`);
  }
  if (!appleLocations.length) {
    notes.push('Nessun POI valido nel pass: aggiungi coordinate e salva di nuovo.');
  } else {
    notes.push(
      `Apple: ${appleLocations.length} POI nel pass, raggio ${effectiveMaxDistanceM} m (lock screen, non push marketing).`
    );
  }
  if (smallestPoiRadiusM != null && effectiveMaxDistanceM > smallestPoiRadiusM) {
    notes.push(
      `Il raggio POI più piccolo è ${smallestPoiRadiusM} m ma la distanza massima è ${effectiveMaxDistanceM} m — Apple usa solo quest’ultima.`
    );
  }
  if (googleLocations.length) {
    notes.push('Google: merchantLocations aggiornate; Google decide raggio e permanenza (Nearby Notifications).');
  }
  if (!appleDevices) {
    notes.push('Nessun iPhone registrato: installa/apri il pass almeno una volta, poi risalva geofencing.');
  } else if (appleLocations.length) {
    notes.push(`${appleDevices} iPhone registrato/i — dopo il salvataggio il pass si aggiorna via APNs silenzioso.`);
  }
  if (!geofencingEnabled && hubMerchantCount > 0) {
    notes.push(`${hubMerchantCount} POI merchant HUB non inclusi (geofencing HUB disattivato).`);
  } else if (geofencingEnabled && hubMerchantCount > 0) {
    notes.push(`${hubMerchantCount} POI merchant HUB disponibili (merge al download pass).`);
  }

  return {
    geofencing_enabled: geofencingEnabled,
    dashboard_pois: dashboardPois,
    hub_merchant_pois: hubMerchantCount,
    apple_locations_in_pass: appleLocations.length,
    apple_poi_limit: APPLE_MAX_POI,
    apple_pois_dropped: applePoisDropped,
    google_merchant_locations: googleLocations.length,
    effective_max_distance_m: effectiveMaxDistanceM,
    smallest_poi_radius_m: smallestPoiRadiusM,
    passes: passCount,
    apple_devices: appleDevices,
    google_objects: googleObjects,
    sample_apple_locations: appleLocations.slice(0, 3),
    notes,
  };
}

function applyGeofenceToBrandConfig(brandConfig, { hubLocations = [], geofencingEnabled = true } = {}) {
  const base = { ...(brandConfig || {}) };
  const hub = geofencingEnabled ? hubLocations : [];
  base.locations = mergeGeofenceLocationSources(base.locations, hub);
  return base;
}

module.exports = {
  APPLE_MAX_POI,
  normalizePassLocations,
  normalizeGoogleMerchantLocations,
  mergeGeofenceLocationSources,
  resolveEffectiveMaxDistanceM,
  minPoiRadiusM,
  buildGeofenceDiagnostics,
  applyGeofenceToBrandConfig,
};
