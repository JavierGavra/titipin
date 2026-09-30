const defaults = {
  apiBaseUrl: '',
  oidcIssuer: '',
  oidcClientId: 'titipin-web',
  oidcRedirectUri: '',
};

export const config = Object.freeze({
  ...defaults,
  ...(globalThis.__TITIPIN_CONFIG__ || {}),
});

export function redirectUri() {
  return config.oidcRedirectUri || `${window.location.origin}/callback`;
}
