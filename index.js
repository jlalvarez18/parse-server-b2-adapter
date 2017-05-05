'use strict';

var B2 = require('backblaze-b2')

function requiredValueOrFromEnv(options, key, envKey) {
    var value = options[key] || process.env[envKey]

    if (!value) {
      throw `B2Adapter requires an ${key}`;
    }

    return value
}

function fromEnvironmentOrDefault(options, key, envKey, defaultValue) {
  return options[key] || process.env[envKey] || defaultValue
}

function B2Adapter(options) {
    this._bucket = requiredValueOrFromEnv(options, 'bucket', 'B2_BUCKET')

    this._bucketPrefix = fromEnvironmentOrDefault(options, 'bucketPrefix', 'B2_BUCKET_PREFIX', '')
    this._globalCacheControl = fromEnvironmentOrDefault(options, 'globalCacheControl', 'B2_GLOBAL_CACHE_CONTROL', null)

    var accountId = requiredValueOrFromEnv(options, 'accountId', 'B2_ACCOUNT_ID')
    var appKey = requiredValueOrFromEnv(options, 'applicationKey', 'B2_APPLICATION_KEY')

    this._b2Client = new B2({
        accountId: accountId,
        applicationKey: appKey
    })

    this._hasBucket = false
}

B2Adapter.prototype.createBucket = function() {
    var promise

    if (this._hasBucket) {
        promise = this._b2Client.authorize()
    } else {
        promise = Promise.resolve().then(() => {
            return this._b2Client.authorize()
        }).then(() => {
            return this._b2Client.createBucket(this._bucket, 'allPublic')
        }).then((result) => {
            var bucketId = result.bucketId
            var downloadUrl = result.downloadUrl

            if (bucketId && downloadUrl) {
                this._hasBucket = true
                this._bucketId = bucketId
                this._downloadUrl = downloadUrl
            } else {
                throw 'Missing bucketId and downloadUrl in response'
            }
        })
    }

    return promise
}

B2Adapter.prototype.createFile = function(filename, data, contentType) {
    return Promise.resolve().then(() => {
        return this.createBucket()
    }).then(() => {
        return this._b2Client.getUploadUrl(this._bucketId)
    }).then((result) => {
        var name = this._bucketPrefix + filename

        return this._b2Client.uploadFile({
            uploadUrl: result.uploadUrl,
            uploadAuthToken: result.authorizationToken,
            filename: name,
            mime: contentType,
            data: data
        })
    })
}

B2Adapter.prototype.deleteFile = function(filename) {
    var name = this._bucketPrefix + filename

    return Promise.resolve().then(() => {
        return this.createBucket()
    }).then(() => {
        return this._b2Client.listFileNames({
            bucketId: this._bucketId,
            maxFileCount: 1,
            delimiter: '',
            prefix: prefix
        })
    }).then((results) => {
        var files = results.files

        for (var i = 0; i < files.length; i++) {
            var file = files[i]
            var _fileName = file.fileName

            if (_fileName == name) {
                return file.fileId
            }
        }
    }).then((fileId) => {
        if (fileId == null) {
            return
        }

        return this._b2Client.deleteFileVersion({
            fileId: fileId,
            fileName: name
        })
    })
}

B2Adapter.prototype.getFileData = function(filename) {
    var name = this._bucketPrefix + filename

    return Promise.resolve().then(() => {
        return this.createBucket()
    }).then(() => {
        return this._b2Client.downloadFileByName({
            bucketName: this._bucket,
            fileName: name
        })
    })
}

B2Adapter.prototype.getFileLocation = function(config, filename) {
    filename = encodeURIComponent(filename)

    return (config.mount + '/files/' + config.applicationId + '/' + filename);
}

module.exports = B2Adapter
module.exports.default = B2Adapter
