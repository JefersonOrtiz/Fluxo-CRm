(function configureFluxoDemo(root) {
  root.FLUXO_CONFIG = Object.freeze({ mode: 'api', apiBaseUrl: '/api' });
  document.documentElement.dataset.fluxoMode = 'api';
  document.documentElement.dataset.authState = 'api';
})(window);
