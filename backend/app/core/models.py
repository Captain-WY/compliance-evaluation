"""Register independent model registries without creating application instances."""
def register_models():
    import importlib, pkgutil
    for package in ['app.modules.compliance.models','app.modules.cases.models']:
        module=importlib.import_module(package)
        for info in pkgutil.iter_modules(module.__path__):
            importlib.import_module(package+'.'+info.name)
    import app.platform.models
