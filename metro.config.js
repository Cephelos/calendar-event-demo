/**
 * Metro config for calendar-event-demo.
 *
 * Resolves linked `file:` packages to their `src/` entry points. Walks transitive
 * `file:` dependencies (e.g. event-module → notification builtin → six mini-modules)
 * so Metro does not miss workspace packages that are not direct demo dependencies.
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver.sourceExts = ['tsx', 'ts', 'jsx', 'js', 'mjs', 'json', 'css'];
config.resolver.unstable_enablePackageExports = true;

/**
 * Collect every `file:` workspace package reachable from this app (including
 * transitive deps, e.g. event-module → builtin → six notification mini-modules).
 * Metro must know each package name → source root so imports resolve from linked sources.
 */
function getLinkedPackages() {
  const linked = new Map();
  const visited = new Set();

  function walk(dir) {
    const resolved = path.resolve(dir);
    if (visited.has(resolved)) return;
    visited.add(resolved);

    const pjPath = path.join(resolved, 'package.json');
    if (!fs.existsSync(pjPath)) return;

    let pj;
    try {
      pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    } catch {
      return;
    }

    const pkgName = pj.name;
    const rootResolved = path.resolve(projectRoot);
    if (pkgName && resolved !== rootResolved) {
      linked.set(pkgName, resolved);
    }

    const allDeps = { ...pj.dependencies, ...pj.devDependencies };
    for (const version of Object.values(allDeps)) {
      if (typeof version !== 'string' || !version.startsWith('file:')) continue;
      const relativePath = version.replace('file:', '');
      const absolutePath = path.resolve(resolved, relativePath);
      if (fs.existsSync(absolutePath)) {
        walk(absolutePath);
      }
    }
  }

  walk(projectRoot);
  return Array.from(linked.entries()).map(([name, pkgPath]) => ({ name, path: pkgPath }));
}

const linkedPackages = getLinkedPackages();

if (linkedPackages.length > 0) {
  const thisNodeModules = path.resolve(projectRoot, 'node_modules');
  config.watchFolders = linkedPackages.map((pkg) => pkg.path);
  config.resolver.nodeModulesPaths = [
    thisNodeModules,
    ...linkedPackages.map((pkg) => path.join(pkg.path, 'node_modules')),
  ];

  /** Map every linked package name → absolute root so Metro/web resolve symlinks reliably. */
  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules || {}),
    ...Object.fromEntries(linkedPackages.map(({ name, path: pkgPath }) => [name, pkgPath])),
  };

  const sharedPackagePrefixes = [
    'react',
    'react-native',
    'tamagui',
    '@tamagui/',
    '@radix-ui/',
    'react-remove-scroll',
    'aria-hidden',
    'tldraw',
    'burnt',
  ];

  const getPackageName = (moduleName) => {
    if (moduleName.startsWith('@')) {
      const parts = moduleName.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : moduleName;
    }
    return moduleName.split('/')[0];
  };

  const shouldRedirect = (moduleName) =>
    sharedPackagePrefixes.some(
      (prefix) => getPackageName(moduleName) === prefix || getPackageName(moduleName).startsWith(prefix)
    );

  /**
   * Return an explicit source-file resolution. Nested `context.resolveRequest(absolutePath)`
   * can fail for package entry points when `package.json` exports + web target interact badly.
   */
  function resolveLinkedSourceFile(absolutePath) {
    return { type: 'sourceFile', filePath: path.normalize(absolutePath) };
  }

  const originalResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    for (const pkg of linkedPackages) {
      if (moduleName === pkg.name) {
        const srcPath = path.join(pkg.path, 'src', 'index.ts');
        if (fs.existsSync(srcPath)) {
          return resolveLinkedSourceFile(srcPath);
        }
        const srcTsx = path.join(pkg.path, 'src', 'index.tsx');
        if (fs.existsSync(srcTsx)) {
          return resolveLinkedSourceFile(srcTsx);
        }
        if (originalResolveRequest) {
          return originalResolveRequest(context, moduleName, platform);
        }
        return context.resolveRequest(context, moduleName, platform);
      }
      if (moduleName.startsWith(`${pkg.name}/`)) {
        const subpath = moduleName.replace(pkg.name, '');
        const srcSubpath = path.join(pkg.path, 'src', subpath.slice(1));
        const candidates = [
          srcSubpath,
          `${srcSubpath}.ts`,
          `${srcSubpath}.tsx`,
          path.join(srcSubpath, 'index.ts'),
          path.join(srcSubpath, 'index.tsx'),
        ];
        for (const candidate of candidates) {
          if (fs.existsSync(candidate)) {
            return resolveLinkedSourceFile(candidate);
          }
        }
        const fallback = `${pkg.path}${subpath}`;
        if (originalResolveRequest) {
          return originalResolveRequest(context, fallback, platform);
        }
        return context.resolveRequest(context, fallback, platform);
      }
    }

    const originDir = context.originModulePath ? path.dirname(context.originModulePath) : '';
    const isFromLinkedPackage = linkedPackages.some((pkg) => originDir.startsWith(pkg.path));
    if (isFromLinkedPackage && shouldRedirect(moduleName)) {
      const pkgName = getPackageName(moduleName);
      const subpath = moduleName.slice(pkgName.length);
      const fullPath = path.join(thisNodeModules, pkgName) + subpath;
      return context.resolveRequest(context, fullPath, platform);
    }

    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;

