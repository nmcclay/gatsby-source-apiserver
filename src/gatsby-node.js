require('babel-polyfill')

const axios = require('axios')
const fetch = require(`./fetch`)
const normalize = require(`./normalize`)
const forEachAsync = require('./helpers').forEachAsync

// const typePrefix = `thirdParty__`

exports.sourceNodes = async ({
  actions,
  createNodeId,
  reporter,
  getCache
}, {
  typePrefix = '',
  url,
  method = 'get',
  headers = {},
  data,
  localSave = false,
  skipCreateNode = false,
  path,
  auth = false,
  auth0Config = false,
  payloadKey,
  name,
  entityLevel,
  schemaType,
  createNodeFields = [{}],
  entitiesArray = [{}],
  params = {},
  verboseOutput = false,
  enableDevRefresh = false,
  refreshId = 'id',
  allowCache = false,
  maxCacheDurationSeconds = 60 * 60 * 24
}) => {
  const cache = getCache('gatsby-source-apiserver')
  //store the attributes in an object to avoid naming conflicts
  const attributes = {typePrefix, url, method, headers, data, localSave, skipCreateNode, path, auth, params, payloadKey, name, entityLevel, schemaType, enableDevRefresh, refreshId}
  const { createNode, createNodeField } = actions;

  // If true, output some info as the plugin runs
  let verbose = verboseOutput

  let authorization
  if(auth0Config) {
    console.time('\nAuthenticate user');
    // Make API request.
    try {
      const loginResponse = await axios(auth0Config);

      if (loginResponse.hasOwnProperty('data')) {
        authorization = 'Bearer ' + loginResponse.data.id_token;
      }
    } catch (error) {
      console.error('\nEncountered authentication error: ' + error);
    }
    console.timeEnd('\nAuthenticate user');
  }

  await forEachAsync(entitiesArray, async (entity) => {
    // default to the general properties for any props not provided
    const typePrefix = entity.typePrefix ? entity.typePrefix : attributes.typePrefix
    const url = entity.url ? entity.url : attributes.url
    const method = entity.method ? entity.method : attributes.method
    const headers = entity.headers ? entity.headers : attributes.headers
    const data = entity.data ? entity.data : attributes.data
    const localSave = entity.localSave ? entity.localSave : attributes.localSave
    const skipCreateNode = entity.skipCreateNode ? entity.skipCreateNode : attributes.skipCreateNode
    const calculateNextPage = entity.calculateNextPage ? entity.calculateNextPage : attributes.calculateNextPage
    const path = entity.path ? entity.path : attributes.path
    const auth = entity.auth ? entity.auth : attributes.auth
    const params = entity.params ? entity.params : attributes.params
    const payloadKey = entity.payloadKey ? entity.payloadKey : attributes.payloadKey
    const name = entity.name ? entity.name : attributes.name
    const entityLevel = entity.entityLevel ? entity.entityLevel : attributes.entityLevel 
    const schemaType = entity.schemaType ? entity.schemaType : attributes.schemaType
    const enableDevRefresh = entity.enableDevRefresh ? entity.enableDevRefresh : attributes.enableDevRefresh
    const refreshId = entity.refreshId ? entity.refreshId : attributes.refreshId

    if (authorization) headers.Authorization = authorization
    // Create an entity type from prefix and name supplied by user
    let entityType = `${typePrefix}${name}`

    // Determine whether to refresh data when running `gatsby develop`
    const devRefresh = process.env.NODE_ENV === 'development' && enableDevRefresh
    const enableRefreshEndpoint = process.env.ENABLE_GATSBY_REFRESH_ENDPOINT

    // Fetch the data
    const response = await fetch({url, method, headers, data, name, localSave, path, payloadKey, auth, params, verbose, reporter, cache, shouldCache: allowCache, maxCacheDurationSeconds, calculateNextPage})

    // Skip node creation if the goal is to only download the data to json files
    if (skipCreateNode) return;

    // Generate the nodes
    normalize.createNodesFromEntities({
      response,
      entityLevel,
      entityType,
      schemaType,
      createNodeFields,
      devRefresh,
      enableRefreshEndpoint,
      refreshId,
      createNode,
      createNodeField,
      createNodeId,
      reporter
    })
  })

  // We're done, return.
  return
};
