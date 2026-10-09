// Use the whole inventory, never the visible bookings, so filtering or changing
// month/status does not reassign colors. Golden-angle spacing avoids cycling a
// short palette when the shop has more cameras.
export function cameraColors(unitIds: string[]) {
  return new Map(
    [...new Set(unitIds)].sort().map((id, index) => {
      const hue = (335 + index * 137.508) % 360;
      return [
        id,
        {
          rental: `hsl(${hue} 65% 87%)`,
          buffer: `hsl(${hue} 65% 96%)`,
          text: `hsl(${hue} 55% 25%)`,
          accent: `hsl(${hue} 60% 43%)`,
        },
      ];
    }),
  );
}
