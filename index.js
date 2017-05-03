var B2 = require('backblaze-b2')

function requiredValueOrFromEnv(options, key, envKey) {
    var value = options[key] || process.env[envKey]

    if (!value) {
      throw `B2Adapter requires an ${key}`;
    }
}

function fromEnvironmentOrDefault(options, key, envKey, defaultValue) {
  return options[key] || process.env[envKey] || defaultValue
}

function B2Adapter(options) {
    this._bucket = requiredValueOrFromEnv(options, 'bucket', 'B2_BUCKET')

    this._bucketPrefix = fromEnvironmentOrDefault(options, 'bucketPrefix', 'B2_BUCKET_PREFIX', '')
    this._directAccess = fromEnvironmentOrDefault(options, 'directAccess', 'B2_DIRECT_ACCESS', false)
    this._globalCacheControl = fromEnvironmentOrDefault(options, 'globalCacheControl', 'B2_GLOBAL_CACHE_CONTROL', null)

    this._b2Client = new B2({
        accountId: requiredValueOrFromEnv(options, 'accountId', 'B2_ACCOUNT_ID'),
        applicationKey: requiredValueOrFromEnv(options, 'applicationKey', 'B2_APPLICATION_KEY')
    })

    this._hasBucket = false
}

B2Adapter.prototype.createBucket = function () {
    var promise

    if (this._hasBucket) {
        promise = this._b2Client.authorize()
    } else {
        promise = Promise.resolve().then(function() {
            return this._b2Client.authorize()
        }).then(function() {
            return this._b2Client.createBucket(this._bucket, 'allPublic')
        }).then(function(result) {
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
    return Promise.resolve().then(function() {
        return this.createBucket()
    }).then(function() {
        return this._b2Client.getUploadUrl(this._bucketId)
    }).then(function(result) {
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

    return Promise.resolve().then(function() {
        return this.createBucket()
    }).then(function() {
        return this._b2Client.listFileNames({
            bucketId: this._bucketId,
            maxFileCount: 1,
            delimiter: '',
            prefix: prefix
        })
    }).then(function(results) {
        var files = results.files

        for (var i = 0; i < files.length; i++) {
            var file = files[i]
            var _fileName = file.fileName

            if (_fileName == name) {
                return file.fileId
            }
        }
    }).then(function(fileId) {
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

    return Promise.resolve().then(function() {
        return this.createBucket()
    }).then(function() {
        return this._b2Client.downloadFileByName({
            bucketName: this._bucket,
            fileName: name
        })
    })
}

B2Adapter.prototype.getFileLocation = async function(config, filename) {
    filename = encodeURIComponent(filename)

    if (this._directAccess) {
        var name = this._bucketPrefix + filename

        try {
            await this.createBucket()

            return '${this._downloadUrl}/file/${this._bucket}/${name}'
        } catch (e) {
            throw e
        }
    }

    return (config.mount + '/files/' + config.applicationId + '/' + filename);
}

module.exports = B2Adapter
module.exports.default = B2Adapter
