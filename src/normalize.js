const stringify = require(`json-stringify-safe`)
const deepMapKeys = require(`deep-map-keys`)
const nanoid = require(`nanoid`)
const chalk = require('chalk')
const log = console.log
const { digest, objectRef } = require('./helpers')

// Prefix to use if there is a conflict with key name
const conflictFieldPrefix = `alternative_`

// Keys that will conflic with graphql
const restrictedNodeFields = [`id`, `children`, `parent`, `fields`, `internal`]

// Create nodes from entities
exports.createNodesFromEntities = ({response, entityLevel, entityType, schemaType, createNodeFields, devRefresh, enableRefreshEndpoint, refreshId, createNode, createNodeField, createNodeId, reporter}) => {
  let entities = response;
  // Interpolate entities from nested response
  if (entityLevel) entities = objectRef(entities, entityLevel);
  // If entities is a single object, add to array to prevent issues with creating nodes
  if (entities && !Array.isArray(entities)) entities = [entities];
  // Standardize and clean keys
  entities = standardizeKeys(entities);
  // Add entity type to each entity
  entities = createEntityType(entityType, entities);

  const dummyEntity = {
    id: 'dummy',
    __type: entityType,
    ...schemaType
  }
  entities.push(dummyEntity)

  // warn if setting `enableDevRefresh` but not `ENABLE_GATSBY_REFRESH_ENDPOINT`
  if (devRefresh && !enableRefreshEndpoint) {
    log(chalk`{bgCyan.black Plugin ApiServer} {yellow warning} enableDevRefresh only works with ENABLE_GATSBY_REFRESH_ENDPOINT enabled.\n{bgCyan.black Plugin ApiServer} see https://www.gatsbyjs.org/docs/environment-variables/#reserved-environment-variables`)
  }

  entities.forEach(e => {
    const { __type, ...entity } = e

    // if (schemaType) {
    //   const fieldNames = Object.keys(entity)
    //   fieldNames.forEach(fieldName => {
    //     entity[fieldName] = setBlankValue(schemaType[fieldName], entity[fieldName])
    //   })
    // }

    let id = entity.id === 'dummy' ? 'dummy' : createGatsbyId(createNodeId);

    // override ID for dev refresh
    // see https://github.com/gatsbyjs/gatsby/issues/14653
    if (devRefresh && enableRefreshEndpoint) {
      if (restrictedNodeFields.includes(refreshId)) {
        refreshId = `${conflictFieldPrefix}${refreshId}`
      }
      if (entity[refreshId]) {
        id = entity[refreshId];
      }
    }

    const node = {
      ...entity,
      id: id,
      parent: null,
      children: [],
      internal: {
        type: __type,
        mediaType: 'application/json',
        contentDigest: digest(JSON.stringify(entity))
      }
    };

    createNode(node);
    createNodeFields.forEach(field => {
      createNodeField({
        node,
        name: field.name,
        value: field.value(node, response)
      });
    });
  })
}

// If entry is not set by user, provide an empty value of the same type
const setBlankValue = (schemaValue, fieldValue) => {
  if (typeof schemaValue === 'string') {
    return typeof fieldValue === `undefined` || fieldValue === null ? '' : fieldValue
  } else if (typeof schemaValue === 'number') {
    return typeof fieldValue === `undefined` || fieldValue === null ? NaN : fieldValue
  } else if (typeof schemaValue === 'object' && !Array.isArray(schemaValue)) {
    const obj = typeof fieldValue === `undefined` || fieldValue === null ? {} : fieldValue
    Object.keys(schemaValue).forEach(itemName => {
      obj[itemName] = setBlankValue(schemaValue[itemName])
    })
    return obj
  } else if (typeof schemaValue === 'object' && Array.isArray(schemaValue)) {
    // TODO: Need to fix it
    return [setBlankValue(schemaValue[0])]
  } else if (typeof schemaValue === 'boolean') {
    return typeof fieldValue === `undefined` || fieldValue === null ? false : fieldValue
  } else {
    return fieldValue
  }
}

/**
 * Validate the GraphQL naming convetions & protect specific fields.
 *
 * @param {any} key
 * @returns the valid name
 */
function getValidKey({ key, verbose = false }) {
  let nkey = String(key)
  const NAME_RX = /^[_a-zA-Z][_a-zA-Z0-9]*$/
  let changed = false
  // Replace invalid characters
  if (!NAME_RX.test(nkey)) {
    changed = true
    nkey = nkey.replace(/-|__|:|\$|\.|\s/g, '_');
  }
  // Prefix if first character isn't a letter.
  if (!NAME_RX.test(nkey.slice(0, 1))) {
    changed = true
    nkey = `${conflictFieldPrefix}${nkey}`
  }
  if (restrictedNodeFields.includes(nkey)) {
    changed = true
    nkey = `${conflictFieldPrefix}${nkey}`.replace(/-|__|:|\$|\.|\s/g, '_');
  }
  if (changed && verbose)
    log(chalk`{bgCyan.black Plugin ApiServer} Object with key "${key}" breaks GraphQL naming convention. Renamed to "${nkey}"`)

  return nkey
}

exports.getValidKey = getValidKey

// Standardize ids + make sure keys are valid.
const standardizeKeys = entities =>
  entities.map(e =>
    deepMapKeys(
      e,
      key => (key === `ID` ? getValidKey({ key: `id` }) : getValidKey({ key }))
    )
)

// Generate a unique id for each entity
const createGatsbyId = (createNodeId) =>
  createNodeId(`${nanoid()}`)

// Add entity type to each entity
const createEntityType = (entityType, entities) =>
  entities.map(e => {
    e.__type = entityType
    return e
})
