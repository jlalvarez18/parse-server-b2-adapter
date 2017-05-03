var B2 = require('backblaze-b2')

function B2Adapter() {
    this._bucket = options.bucket
    this._bucketPrefix = options.bucketPrefix
    this._baseUrl = options.baseUrl
    this._globalCacheControl = options.globalCacheControl

    this._b2Client = new B2({
        accountId: options.accountId,
        applicationKey: options.applicationKey
    })

    this._hasBucket = false
}

B2Adapter.prototype.createBucket = function () {
    var promise

    if (this._hasBucket) {
        promise = Promise.resolve()
    } else {
        promise = this._b2Client.createBucket(this._bucket, 'allPublic').then(function(result) {
            var bucketId = result.bucketId

            if (bucketId) {
                this._hasBucket = true
                this._bucketId = bucketId
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
        return this._b2Client.uploadFile({
            uploadUrl: result.uploadUrl,
            uploadAuthToken: result.authorizationToken,
            filename: this._bucketPrefix + filename,
            mime: contentType,
            data: data
        })
    })
}
