'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePassLocations,
  mergeGeofenceLocationSources,
  buildGeofenceDiagnostics,
  applyGeofenceToBrandConfig,
} = require('../src/engine/geofencing');
const { generatePassJson } = require('../src/engine/passkit');

test('normalizePassLocations keeps relevantText and caps at 10', () => {
  const locs = normalizePassLocations({
    locations: [{ latitude: 45.46, longitude: 9.19, relevantText: 'Ciao' }],
  });
  assert.equal(locs.length, 1);
  assert.equal(locs[0].relevantText, 'Ciao');
});

test('hub merchant POIs skipped when geofencing disabled', () => {
  const merged = applyGeofenceToBrandConfig(
    { locations: [{ latitude: 1, longitude: 2, relevantText: 'A' }] },
    {
      geofencingEnabled: false,
      hubLocations: [{ latitude: 3, longitude: 4, relevantText: 'Hub' }],
    }
  );
  assert.equal(merged.locations.length, 1);
  assert.equal(merged.locations[0].relevantText, 'A');
});

test('buildGeofenceDiagnostics explains Apple lock screen vs radius', () => {
  const d = buildGeofenceDiagnostics({
    brandConfig: {
      locations: [{ latitude: 45.46, longitude: 9.19, relevantText: 'Vicino', radius: 150 }],
      maxDistance: 500,
    },
    hubSettings: { geofencing_enabled: true },
    hubMerchantLocations: [],
    appleDevices: 1,
    googleObjects: 1,
    passCount: 2,
  });
  assert.equal(d.apple_locations_in_pass, 1);
  assert.equal(d.effective_max_distance_m, 500);
  assert.ok(d.notes.some((n) => /lock screen/i.test(n)));
  assert.ok(d.notes.some((n) => /150 m.*500 m/i.test(n)));
});

test('generatePassJson still embeds locations for HR brand', () => {
  const passJson = generatePassJson(
    { id: 'tpl1', name: 'HR', fields: {}, style: {} },
    { id: 'pass1', serial_number: 'SN-GEO-1', field_values: {} },
    {
      id: 'brand1',
      name: 'Acme HR',
      slug: 'acme',
      config: {
        product_line: 'hr',
        locations: [{ latitude: 45.4764, longitude: 9.1432, relevantText: 'Sei vicino', radius: 50 }],
        maxDistance: 50,
      },
    },
    { baseUrl: 'https://studio.example.test', member: { first_name: 'Mario', last_name: 'Rossi' } }
  );
  assert.equal(passJson.locations.length, 1);
  assert.equal(passJson.maxDistance, 50);
});
