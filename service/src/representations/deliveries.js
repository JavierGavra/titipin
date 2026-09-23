'use strict';

function toLocation(row) {
  return {
    locationId: row.location_id, deliveryId: row.delivery_id,
    latitude: row.latitude, longitude: row.longitude,
    recordedAt: row.recorded_at.toISOString(), receivedAt: row.received_at.toISOString(),
  };
}

function toDelivery(row) {
  const lastLocation = row.last_location !== null && row.last_location !== undefined
    ? {
        latitude: row.last_location.latitude,
        longitude: row.last_location.longitude,
        recordedAt: row.last_location.recorded_at instanceof Date
          ? row.last_location.recorded_at.toISOString()
          : row.last_location.recordedAt ?? row.last_location.recorded_at,
      }
    : null;

  return {
    deliveryId: row.delivery_id,
    assignmentId: row.assignment_id,
    status: row.status,
    deliveryAddress: row.delivery_address,
    lastLocation,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at !== null && row.started_at !== undefined
      ? row.started_at.toISOString()
      : null,
    deliveredAt: row.delivered_at !== null && row.delivered_at !== undefined
      ? row.delivered_at.toISOString()
      : null,
    confirmedAt: row.confirmed_at !== null && row.confirmed_at !== undefined
      ? (row.confirmed_at instanceof Date ? row.confirmed_at.toISOString() : row.confirmed_at)
      : null,
  };
}

module.exports = { toLocation, toDelivery };
