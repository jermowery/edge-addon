import assert from 'node:assert'
import fs from 'node:fs'

import * as core from '@actions/core'
import axios from 'axios'

import type { ExpectedStatusResponse, StatusResponse } from '@/api-types/status'
import {
  ERR_PACKAGE_VALIDATION,
  ERR_PUBLISHING_PACKAGE,
  OPERATION_TIMEOUT_EXCEEDED,
  RESPONSE_NO_LOCATION,
  RESPONSE_NO_STATUS,
  getStringOrError,
  stringify
} from '@/error'

import type { AxiosResponse } from 'axios'

const WAIT_DELAY = 10 * 1000 // 10 seconds
const MAX_WAIT_TIME = 10 * 60 * 1000 // 10 minutes

function requireExpectedStatusResponse(
  res: AxiosResponse<StatusResponse>
): asserts res is AxiosResponse<ExpectedStatusResponse> {
  if ('status' in res.data) {
    return
  }
  core.debug(JSON.stringify(res.data))
  core.setFailed('The API server does not provide status information.')
  process.exit(RESPONSE_NO_STATUS)
}

function getOperationIdFromResponse(response: AxiosResponse<StatusResponse>): string {
  const responseHeaders = response.headers

  if ('location' in responseHeaders) {
    const operationId = responseHeaders.location as string
    core.debug(`Operation ID: ${operationId}`)
    return operationId
  }

  core.debug(JSON.stringify(responseHeaders))
  core.setFailed('The API server does not provide location information.')
  return process.exit(RESPONSE_NO_LOCATION)
}

async function waitUntilOperationSucceeded(
  url: string,
  apiKey: string,
  clientId: string
): Promise<boolean> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#check-the-status-of-a-package-upload
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#check-the-publishing-status

  let response: AxiosResponse<StatusResponse> | undefined = undefined
  const headers = { 'Authorization': `ApiKey ${apiKey}`, 'X-ClientID': clientId }

  const endTime = Date.now() + MAX_WAIT_TIME
  while (Date.now() < endTime) {
    core.info('Checking if operation has succeeded.')

    response = await axios<StatusResponse>(url, { headers })
    requireExpectedStatusResponse(response)

    if (response.data.status !== 'InProgress') {
      break
    }

    core.info('Operation still in progress.')
    await new Promise(res => setTimeout(res, WAIT_DELAY))
  }

  assert(response && 'status' in response.data)

  if (response.data.status === 'Succeeded') {
    return true
  }

  if (response.data.status === 'InProgress') {
    core.setFailed('Operation timeout exceeded.')
    process.exit(OPERATION_TIMEOUT_EXCEEDED)
  }

  // Here operation failed.

  // TODO: Add more instruction about which failure type is. The API documentation explains much for
  // different types, and we had better show a URL to the doc for users to check the details.

  if (response.data.message) {
    core.setFailed(response.data.message)
  }

  if (response.data.errorCode) {
    core.setFailed(`Validation failed: ${response.data.errorCode}`)
  } else {
    core.setFailed('Validation failed. The API server does not provide any error code.')
  }

  if (response.data.errors?.length) {
    for (const e of response.data.errors) {
      core.setFailed(getStringOrError(e))
    }
  }

  if (!response.data.message && !response.data.errors?.length) {
    core.debug(stringify(response.data))
    core.setFailed('Validation failed. The API server does not provide any error message.')
  }

  return false
}

export async function uploadPackage(
  productId: string,
  zipPath: string,
  apiKey: string,
  clientId: string
): Promise<string> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#upload-a-package-to-update-an-existing-submission
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api?tabs=v1-1#uploading-a-package-to-update-an-existing-submission
  core.info('Uploading package.')
  const url = `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/draft/package`
  const zipStream = fs.createReadStream(zipPath)
  const headers = {
    'Content-Type': 'application/zip',
    'Authorization': `ApiKey ${apiKey}`,
    'X-ClientID': clientId
  }
  const response = await axios.post<never>(url, zipStream, { headers }) // 202 Accepted
  const operationId = getOperationIdFromResponse(response)
  core.info('Package uploaded.')
  return operationId
}

export async function waitUntilPackageValidated(
  productId: string,
  apiKey: string,
  clientId: string,
  operationId: string
) {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api?tabs=v1-1#checking-the-status-of-a-package-upload
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#check-the-status-of-a-package-upload
  core.info('Waiting until upload request accepted.')
  const url = `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/draft/package/operations/${operationId}`
  const ok = await waitUntilOperationSucceeded(url, apiKey, clientId)
  if (!ok) {
    core.setFailed('Package validation failed.')
    process.exit(ERR_PACKAGE_VALIDATION)
  }
  core.info('Validation succeeded.')
}

export async function sendPackagePublishingRequest(
  productId: string,
  apiKey: string,
  clientId: string
): Promise<string> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#publish-the-product-draft-submission
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api?tabs=v1-1#publishing-the-submission
  core.info('Sending publishing request.')
  const url = `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions`
  const response = await axios.post<never>(
    url,
    {}, // Empty body
    { headers: { 'Authorization': `ApiKey ${apiKey}`, 'X-ClientID': clientId } }
  )
  const operationId = getOperationIdFromResponse(response)
  core.info('Publishing request sent.')
  return operationId
}

export async function waitUntilPackagePublished(
  productId: string,
  apiKey: string,
  clientId: string,
  operationId: string
) {
  // https://docs.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference#check-the-publishing-status
  core.info('Waiting until publishing request accepted.')
  const url = `https://api.addons.microsoftedge.microsoft.com/v1/products/${productId}/submissions/operations/${operationId}`
  const ok = await waitUntilOperationSucceeded(url, apiKey, clientId)
  if (!ok) {
    core.setFailed('Failed to publish the add-on.')
    process.exit(ERR_PUBLISHING_PACKAGE)
  }
  core.info('Add-on published.')
}