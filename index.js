"use strict";

const path = require('path');

const constants = require('oma-constants');
const util = require('oma-util');

const metaBundle = `/0/${constants.bundle.file}.json`;

module.exports = (bundleDirectory, bundleNames) => scanBundleReleases(bundleDirectory, bundleNames)
  .then(bundleReleases => {
    const missingBundles = bundleNames.filter(name => !bundleReleases[name]);
    if (missingBundles.length) {
      throw new Error(`Unknown bundle(s): ${missingBundles.join()}`);
    }
    const bestReleases = bestBundleReleases(bundleReleases);
    const bestArchives = bestArchiveVersions(bestReleases, bundleReleases);
    return bestImageModules(bundleDirectory, bestReleases)
      .then(bestModules => ({
        constants: {
          basename: { archive: constants.archive.file, bundle: constants.bundle.file },
          preserve: constants.library.preserve,
          publish: constants.library.publish
        },
        archives: { _: bestArchiveVersions(bestReleases, bundleReleases) },
        bundles: { _: bestReleases },
        modules: { _: metaModules(bestModules) }
      }))
      ;
  })
  ;


function scanBundleReleases(bundleDirectory, bundleNames) {
  const bundleReleases = {};
  const files = bundleNames.map(bundleName => `${bundleDirectory}/${bundleName}/*/${metaBundle}`);
  return util.eachFile(files, metaFile => util.readFileText(metaFile)
    .then(jsonSource => {
      const anonymousHome = path.dirname(metaFile.path);
      const bundleHome = path.dirname(anonymousHome);
      const releaseIdentity = path.basename(bundleHome);
      const bundleName = path.basename(path.dirname(bundleHome));
      const bundleRelease = bundleReleases[bundleName] || (bundleReleases[bundleName] = {});
      const archiveVersions = bundleRelease[releaseIdentity] = {};
      const metaObject = JSON.parse(jsonSource)._;
      for (let moduleName in metaObject) {
        const versionedArchive = metaObject[moduleName].archive;
        archiveVersions[versionedArchive.name] = versionedArchive.version;
      }
    }))
    .then(() => bundleReleases)
    ;
}

function bestBundleReleases(bundleReleases) {
  const bestReleases = {};
  for (let bundleName in bundleReleases) {
    let bestReleaseIdentity = null;
    const releases = bundleReleases[bundleName]
    for (let releaseIdentity in releases) {
      const thisRelease = releases[releaseIdentity];
      if (!bestReleaseIdentity || isBetterRelease(thisRelease, releases[bestReleaseIdentity])) {
        bestReleaseIdentity = releaseIdentity;
      }
    }
    bestReleases[bundleName] = bestReleaseIdentity;
  }
  return bestReleases;
}

function isBetterRelease(newVersions, oldVersions) {
  let totalComparison = 0;
  for (let archiveName in newVersions) {
    const newVersion = newVersions[archiveName], oldVersion = oldVersions[archiveName];
    // if new or old version is undefined, continue with other names
    if (newVersion && oldVersion) {
      const comparison = util.compareVersions(newVersion, oldVersion);
      if (comparison > 0 && totalComparison >= 0) {
        // new version becomes or remains better version
        totalComparison = 1;
      } else if (comparison < 0 && totalComparison <= 0) {
        // new version becomes or remains worse version
        totalComparison = -1;
      } else if (comparison !== 0) {
        // if versions are different, they must be consistently better or worse
        throw new Error(`Inconsistent versions: ${archiveName} ${newVersion} & ${oldVersion}`);
      }
    }
  }
  return totalComparison > 0;
}

function bestArchiveVersions(bestReleases, bundleReleases) {
  const archives = {}
  for (let bundleName in bestReleases) {
    const releaseIdentity = bestReleases[bundleName];
    const archiveVersions = bundleReleases[bundleName][releaseIdentity];
    for (let archiveName in archiveVersions) {
      const thisVersion = archiveVersions[archiveName];
      const existingVersion = archives[archiveName];
      if (!existingVersion) {
        archives[archiveName] = thisVersion;
      } else if (existingVersion !== thisVersion) {
        throw new Error(`Version conflict: ${archiveName} ${existingVersion} & ${thisVersion}`);
      }
    }
  }
  return archives;
}

function bestImageModules(bundleDirectory, bestReleases) {
  const modules = {};
  return Promise.all(Object.keys(bestReleases).map(bundleName => {
    const bundleRelease = bestReleases[bundleName];
    const metaPath = `${bundleDirectory}/${bundleName}/${bundleRelease}/${metaBundle}`;
    return util.openReadStream(metaPath)
      .then(inputStream => util.readStreamText(inputStream))
      .then(jsonSource => {
        const metaObject = JSON.parse(jsonSource)._;
        for (let moduleName in metaObject) {
          if (moduleName) {
            if (modules[moduleName]) {
              const conflictingBundles = `${bundleName} & ${modules[moduleName].bundle}`;
              throw new Error(`Module conflict: ${moduleName} in ${conflictingBundles}`);
            }
            modules[moduleName] = Object.assign({ bundle: bundleName }, metaObject[moduleName]);
          }
        }
      })
      ;
  }))
    .then(() => modules)
    ;
}

function metaModules(bestModules) {
  const modules = {};
  for (let moduleName in bestModules) {
    const meta = bestModules[moduleName];
    modules[moduleName] = {
      bundle: meta.bundle,
      ordinal: meta.ordinal,
      optional: meta.optional,
      depends: meta.depends
    };
  }
  return modules;
}