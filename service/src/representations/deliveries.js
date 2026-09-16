'use strict';

function toLocation(row) {
  return {
    locationId: row.location_id, deliveryId: row.delivery_id,
    latitude: row.latitude, longitude: row.longitude,
    recordedAt: row.recorded_at.toISOString(), receivedAt: row.received_at.toISOString(),
  };
}

module.exports = { toLocation };
