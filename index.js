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
    console.log('Called createBucket()')

    if (this._hasBucket) {
        console.log('Authorizing B2 Client')

        return this._b2Client.authorize()
    } else {
        return Promise.resolve().then(() => {
            console.log('Authorizing B2 Client')

            return this._b2Client.authorize()
        }).then(() => {
            console.log('Getting list of buckets')

            return this._b2Client.listBuckets()
        }).then((response) => {
            console.log(response.data)

            var buckets = response.data.buckets

            for (var i = 0; i < buckets.length; i++) {
                var bucket = buckets[i]

                if (bucket.bucketName == this._bucket) {
                    console.log('Found matching Bucket: ' + bucket)
                    return { data: bucket }
                }
            }

            console.log('Creating B2 Bucket with name: ' + this._bucket)

            return this._b2Client.createBucket(this._bucket, 'allPublic')
        }).then((result) => {
            var bucketId = result.data.bucketId

            console.log('Created B2 Bucket with id: ' + bucketId)

            if (bucketId) {
                this._hasBucket = true
                this._bucketId = bucketId
            } else {
                throw 'Missing bucketId and downloadUrl in response'
            }
        })
    }
}

B2Adapter.prototype.createFile = function(filename, data, contentType) {
    console.log('Called createFile()')

    return Promise.resolve().then(() => {
        return this.createBucket()
    }).then(() => {
        console.log('Getting upload url for bucketId: ' + this._bucketId)

        return this._b2Client.getUploadUrl(this._bucketId)
    }).then((result) => {
        var uploadUrl = result.data.uploadUrl
        var authToken = result.data.authorizationToken

        console.log(`Received uploadUrl: ${uploadUrl} and authToken: ${authToken}`)

        var name = this._bucketPrefix + filename

        console.log('Uploading file with name: ' + name)

        return this._b2Client.uploadFile({
            uploadUrl: uploadUrl,
            uploadAuthToken: authToken,
            filename: name,
            mime: contentType,
            data: data
        })
    })
}

B2Adapter.prototype.deleteFile = function(filename) {
    console.log('Called deleteFile()')
    var name = this._bucketPrefix + filename

    return Promise.resolve().then(() => {
        return this.createBucket()
    }).then(() => {
        console.log('Getting list of file names for bucketId: ' + this._bucketId)

        return this._b2Client.listFileNames({
            bucketId: this._bucketId,
            maxFileCount: 1,
            delimiter: '',
            prefix: prefix
        })
    }).then((results) => {
        var files = results.data.files

        for (var i = 0; i < files.length; i++) {
            var file = files[i]
            var _fileName = file.fileName

            if (_fileName == name) {
                console.log('Found matching file with name: ' + name)
                return file.fileId
            }
        }
    }).then((fileId) => {
        if (fileId == null) {
            console.log('Did not find matching file with name: ' + name)
            return
        }

        console.log('Deleting file with name: ' + name)

        return this._b2Client.deleteFileVersion({
            fileId: fileId,
            fileName: name
        })
    })
}

B2Adapter.prototype.getFileData = function(filename) {
    console.log('Called getFileData()')

    var name = this._bucketPrefix + filename

    return Promise.resolve().then(() => {
        return this.createBucket()
    }).then(() => {
        console.log('Downloading file with name: ' + name)

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
