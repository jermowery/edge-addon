// Types of responses of upload and publishing status.

// https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#response-when-the-publish-call-fails-with-an-unexpected-failure
interface UnexpectedStatusResponse {
  id: string
  message: string
}

// https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#response-when-the-publish-call-succeeds
// https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#check-the-publishing-status
interface SuccessfulStatusResponse {
  id: string
  createdTime: string // Date
  lastUpdatedTime: string // Date
  status: 'Succeeded'
  message: string
  errorCode: ''
  errors: null
}

// https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#response-when-the-operation-is-still-in-progress
// https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#check-the-publishing-status
interface InProgressStatusResponse {
  id: string
  createdTime: string // Date
  lastUpdatedTime: string // Date
  status: 'InProgress'
  message: null
  errorCode: null
  errors: null
}

// https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference?tabs=v1-1#response-when-the-operation-fails-with-errors
export interface FailedStatusResponse {
  id: string
  createdTime: string // Date
  lastUpdatedTime: string // Date
  status: 'Failed'
  message: string | null
  errorCode: null | string
  errors: null | { message: string }[]
}

export type ExpectedStatusResponse =
  | SuccessfulStatusResponse
  | FailedStatusResponse
  | InProgressStatusResponse

export type StatusResponse = UnexpectedStatusResponse | ExpectedStatusResponse
