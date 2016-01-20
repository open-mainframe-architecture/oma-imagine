"use strict";

var path = require('path');

var constants = require('oma-constants');
var util = require('oma-util');

module.exports = function (bundleDirectory, bundleNames) {
  return scanBundleReleases(bundleDirectory, bundleNames)
    .then(function (bundleReleases) {
      var missingBundles = bundleNames.filter(function (name) { return !bundleReleases[name]; });
      if (missingBundles.length) {
        throw new Error('Unknown bundle(s): ' + missingBundles.join());
      }
      var bestReleases = bestBundleReleases(bundleReleases);
      var bestArchives = bestArchiveVersions(bestReleases, bundleReleases);
      console.log(bestReleases);
      console.log(bestArchives);
    })
    ;
}

function scanBundleReleases(bundleDirectory, bundleNames) {
  var bundleReleases = {};
  return util.mapFiles(bundleNames.map(function(bundleName) {
    return bundleDirectory + '/' + bundleName + '/*/' + constants.bundle.loader + '.json';
  }), function (metaFile, cb) {
    util.readFileText(metaFile)
      .then(function (jsonSource) {
        var bundleHome = path.dirname(metaFile.path);
        var releaseIdentity = path.basename(bundleHome);
        var bundleName = path.basename(path.dirname(bundleHome));
        var bundleRelease = bundleReleases[bundleName] || (bundleReleases[bundleName] = {});
        var archiveVersions = bundleRelease[releaseIdentity] = {};
        var metaObject = JSON.parse(jsonSource)._;
        for (var moduleName in metaObject) {
          var archiveVersion = metaObject[moduleName].archive;
          archiveVersions[archiveVersion.name] = archiveVersion.version;
        }
        cb(null);
      })
    ;
  })
    .then(function () {
      return bundleReleases;
    })
    ;
}

function bestBundleReleases(bundleReleases) {
  var bestReleases = {};
  for (var bundleName in bundleReleases) {
    var bestReleaseIdentity = null;
    var releases = bundleReleases[bundleName]
    for (var releaseIdentity in releases) {
      var thisRelease = releases[releaseIdentity];
      if (!bestReleaseIdentity || isBetterRelease(thisRelease, releases[bestReleaseIdentity])) {
        bestReleaseIdentity = releaseIdentity;
      }
    }
    bestReleases[bundleName] = bestReleaseIdentity;
  }
  return bestReleases;
}

function isBetterRelease(newVers, oldVers) {
  var totalComparison = 0;
  for (var archiveName in newVers) {
    var newVer = newVers[archiveName], oldVer = oldVers[archiveName];
    // if new or old version is undefined, continue with other names
    if (newVer && oldVer) {
      var comparison = util.compareVersions(newVer, oldVer);
      if (comparison > 0 && totalComparison >= 0) {
        // new version becomes or remains better version
        totalComparison = 1;
      } else if (comparison < 0 && totalComparison <= 0) {
        // new version becomes or remains worse version
        totalComparison = -1;
      } else if (comparison !== 0) {
        // if versions are different, they must be consistently better or worse
        throw new Error('Inconsistent versions: ' + archiveName + ' ' + newVer + ' & ' + oldVer);
      }
    }
  }
  return totalComparison > 0;
}

function bestArchiveVersions(bestReleases, bundleReleases) {
  var archives = {}
  for (var bundleName in bestReleases) {
    var releaseIdentity = bestReleases[bundleName];
    var archiveVers = bundleReleases[bundleName][releaseIdentity];
    for (var archiveName in archiveVers) {
      var thisVer = archiveVers[archiveName];
      var existingVer = archives[archiveName];
      if (!existingVer) {
        archives[archiveName] = thisVer;
      } else if (existingVer !== thisVer) {
        throw new Error('Version conflict: ' + archiveName + ' ' + existingVer + ' & ' + thisVer);
      }
    }
  }
  return archives;
}