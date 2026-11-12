(function configureFluxoDemo(root) {
  root.FLUXO_CONFIG = Object.freeze({ mode: 'demo', apiBaseUrl: '/api' });
  document.documentElement.dataset.fluxoMode = 'demo';
  document.documentElement.dataset.authState = 'demo';
})(window);
