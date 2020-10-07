// TODO: Switch require once upstream bugs are fixed.
// const xpath = require('xml2js-xpath')
// Temporary
const xpath = require('../utils/xpath')

const schemaUtils = require('../utils/schema')

const types = require('./types')
const TagEntry = types.TagEntry
const Mapping = types.Mapping

const buildMappingObject = function(xmlData) {
  const nodeData = {}
  let hasNoDuplicates = true
  const rootElement = xmlData.HED
  setParent(rootElement, null)
  const tagElements = xpath.find(rootElement, '//node')
  for (const tagElement of tagElements) {
    if (getElementTagValue(tagElement) === '#') {
      continue
    }
    const tagPath = getTagPathFromTagElement(tagElement)
    const shortPath = tagPath[0]
    tagPath.reverse()
    const longPath = tagPath.join('/')
    const tagObject = new TagEntry(shortPath, longPath)
    if (!(shortPath in nodeData)) {
      nodeData[shortPath] = tagObject
    } else {
      hasNoDuplicates = false
      if (!Array.isArray(nodeData[shortPath])) {
        nodeData[shortPath] = [nodeData[shortPath]]
      }
      nodeData[shortPath].push(tagObject)
    }
  }
  return new Mapping(nodeData, hasNoDuplicates)
}

const setParent = function(node, parent) {
  node.$parent = parent
  if (node.node) {
    for (const child of node.node) {
      setParent(child, node)
    }
  }
}

const getTagPathFromTagElement = function(tagElement) {
  const ancestorTags = [getElementTagValue(tagElement)]
  let parentTagName = getParentTagName(tagElement)
  let parentElement = tagElement.$parent
  while (parentTagName) {
    ancestorTags.push(parentTagName)
    parentTagName = getParentTagName(parentElement)
    parentElement = parentElement.$parent
  }
  return ancestorTags
}

const getElementTagValue = function(element, tagName = 'name') {
  return element[tagName][0]._
}

const getParentTagName = function(tagElement) {
  const parentTagElement = tagElement.$parent
  if (parentTagElement && 'name' in parentTagElement) {
    return parentTagElement.name[0]._
  } else {
    return ''
  }
}

/**
 * Build a short-long mapping from a remote schema.
 *
 * @param {String} version The schema version to use. Leave empty for the latest version.
 * @return {Promise<Mapping>} The mapping object.
 */
const buildRemoteMapping = function(version = 'Latest') {
  return schemaUtils.loadRemoteSchema(version).then(xmlData => {
    return buildMappingObject(xmlData)
  })
}

/**
 * Build a short-long mapping from a local file.
 *
 * @param {String} path The path to the schema data.
 * @return {Promise<Mapping>} The mapping object.
 */
const buildLocalMapping = function(path) {
  return schemaUtils.loadLocalSchema(path).then(xmlData => {
    return buildMappingObject(xmlData)
  })
}

/**
 * Build a short-long mapping from a schema.
 *
 * @param {{path: String?, version: String?}} schemaDef The description of which schema to use.
 * @return {Promise<never>|Promise<Mapping>} The mapping object or an error.
 */
const buildMapping = function(schemaDef = {}) {
  if (Object.entries(schemaDef).length === 0) {
    return buildRemoteMapping()
  } else if (schemaDef.path) {
    return buildLocalMapping(schemaDef.path)
  } else if (schemaDef.version) {
    return buildRemoteMapping(schemaDef.version)
  } else {
    return Promise.reject('Invalid input.')
  }
}

module.exports = {
  buildMapping: buildMapping,
  Mapping: Mapping,
}
