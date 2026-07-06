(function () {
  const registry = [];
  const actionRegistry = [];
  const idPattern = /^[a-z][a-z0-9-]*$/;

  function register(moduleConfig) {
    if (!moduleConfig || typeof moduleConfig !== 'object') {
      throw new Error('FlowModules.register erwartet ein Konfigurationsobjekt.');
    }

    if (!idPattern.test(moduleConfig.id || '')) {
      throw new Error('Modul-IDs muessen klein geschrieben sein und duerfen nur a-z, 0-9 und Bindestriche enthalten.');
    }

    const index = registry.findIndex(module => module.id === moduleConfig.id);
    if (index >= 0) registry.splice(index, 1, moduleConfig);
    else registry.push(moduleConfig);

    return moduleConfig;
  }

  function all() {
    return registry.slice();
  }

  function get(id) {
    return registry.find(module => module.id === id) || null;
  }

  function registerAction(actionConfig) {
    if (!actionConfig || typeof actionConfig !== 'object') {
      throw new Error('FlowActions.register erwartet ein Konfigurationsobjekt.');
    }

    if (!actionConfig.id || !actionConfig.label || typeof actionConfig.run !== 'function') {
      throw new Error('Aktionen brauchen mindestens id, label und run().');
    }

    const index = actionRegistry.findIndex(action => action.id === actionConfig.id);
    if (index >= 0) actionRegistry.splice(index, 1, actionConfig);
    else actionRegistry.push(actionConfig);

    return actionConfig;
  }

  function allActions() {
    return actionRegistry.slice();
  }

  function getAction(id) {
    return actionRegistry.find(action => action.id === id) || null;
  }

  window.FlowModules = { register, all, get };
  window.FlowActions = { register: registerAction, all: allActions, get: getAction };
})();
