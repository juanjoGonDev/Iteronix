type LocationLike = Pick<Location, "origin">;

const LocalDevelopment = {
  WebUiPort: "4000",
  BackendPort: "4001",
  Localhost: "localhost",
  Loopback: "127.0.0.1",
} as const;

export const readBackendOrigin = (
  location: LocationLike = window.location,
): string => {
  const origin = trimTrailingSlash(location.origin);
  const url = new URL(origin);
  const isLocalDevelopmentHost =
    url.hostname === LocalDevelopment.Localhost ||
    url.hostname === LocalDevelopment.Loopback;

  if (isLocalDevelopmentHost && url.port === LocalDevelopment.WebUiPort) {
    url.port = LocalDevelopment.BackendPort;
    return trimTrailingSlash(url.origin);
  }

  return origin;
};

const trimTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;
