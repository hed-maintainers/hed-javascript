const utils = require('../utils')
const { convertPartialHedStringToLong } = require('../converter/converter')

const openingGroupCharacter = '('
const closingGroupCharacter = ')'

/**
 * A parsed HED substring.
 */
class ParsedHedSubstring {
  /**
   * Constructor.
   * @param {string} originalTag The original pre-parsed version of the HED substring.
   * @param {int[]} originalBounds The bounds of the HED substring in the original HED string.
   */
  constructor(originalTag, originalBounds) {
    /**
     * The original pre-parsed version of the HED tag.
     * @type {string}
     */
    this.originalTag = originalTag
    /**
     * The bounds of the HED tag in the original HED string.
     * @type {int[]}
     */
    this.originalBounds = originalBounds
  }
}

/**
 * A parsed HED tag.
 */
class ParsedHedTag extends ParsedHedSubstring {
  /**
   * Constructor.
   * @param {string} originalTag The original HED tag.
   * @param {string} hedString The original HED string.
   * @param {int[]} originalBounds The bounds of the HED tag in the original HED string.
   * @param {Schemas} hedSchemas The collection of HED schemas.
   */
  constructor(originalTag, hedString, originalBounds, hedSchemas) {
    super(originalTag, originalBounds)
    /**
     * The formatted canonical version of the HED tag.
     *
     * The empty string default value should be replaced during formatting. Failure to do so
     * signals an error, as an empty tag should never happen.
     * @type {string}
     */
    this.formattedTag = ''
    let canonicalTag, conversionIssues
    if (hedSchemas.baseSchema) {
      ;[canonicalTag, conversionIssues] = convertPartialHedStringToLong(
        hedSchemas,
        originalTag,
        hedString,
        originalBounds[0],
      )
    } else {
      canonicalTag = originalTag
      conversionIssues = []
    }
    /**
     * The canonical form of the HED tag.
     * @type {string}
     */
    this.canonicalTag = canonicalTag
    /**
     * Any issues encountered during tag conversion.
     * @type {Array}
     */
    this.conversionIssues = conversionIssues
  }
}

/**
 * Determine a parsed HED tag group's Definition tags.
 *
 * @param {ParsedHedGroup} group The parsed HED tag group.
 * @param {Schemas} hedSchemas The collection of HED schemas.
 * @return {null|ParsedHedTag[]|ParsedHedTag} The Definition tag(s)
 */
const groupDefinitionTag = function (group, hedSchemas) {
  const definitionTags = group.tags.filter((tag) => {
    return (
      hedSchemas.baseSchema &&
      hedSchemas.isHed3 &&
      tag instanceof ParsedHedTag &&
      utils.HED.isDescendantOf(
        tag.canonicalTag,
        convertPartialHedStringToLong(
          hedSchemas,
          'Definition',
          'Definition',
          0,
        )[0],
      )
    )
  })
  switch (definitionTags.length) {
    case 0:
      return null
    case 1:
      return definitionTags[0]
    default:
      return definitionTags
  }
}

/**
 * A parsed HED tag group.
 */
class ParsedHedGroup extends ParsedHedSubstring {
  /**
   * Constructor.
   * @param {(ParsedHedSubstring)[]} parsedHedTags The parsed HED tags in the HED tag group.
   * @param {string} originalTagGroup The original pre-parsed version of the HED tag group.
   * @param {int[]} originalBounds The bounds of the HED tag group in the original HED string.
   * @param {Schemas} hedSchemas The collection of HED schemas.
   */
  constructor(originalTagGroup, parsedHedTags, originalBounds, hedSchemas) {
    super(originalTagGroup, originalBounds)
    /**
     * The parsed HED tags in the HED tag group.
     * @type {(ParsedHedSubstring)[]}
     */
    this.tags = parsedHedTags
    /**
     * The Definition tag associated with this HED tag group.
     * @type {ParsedHedTag|ParsedHedTag[]|null}
     */
    this.definitionTag = groupDefinitionTag(this, hedSchemas)
    /**
     * Whether this HED tag group is a definition group.
     * @type {boolean}
     */
    this.isDefinitionGroup = this.definitionTag !== null
  }

  /**
   * Iterator over the full HED groups and subgroups in this HED tag group.
   * @return {Generator<*, ParsedHedTag[], *>}
   */
  *subGroupIterator() {
    const currentGroup = []
    for (const innerTag of this.tags) {
      if (innerTag instanceof ParsedHedTag) {
        currentGroup.push(innerTag)
      } else if (innerTag instanceof ParsedHedGroup) {
        yield* innerTag.subGroupIterator()
      }
    }
    yield currentGroup
  }

  /**
   * Iterator over the parsed HED tags in this HED tag group.
   * @return {Generator<*, ParsedHedTag, *>}
   */
  *tagIterator() {
    for (const innerTag of this.tags) {
      if (innerTag instanceof ParsedHedTag) {
        yield innerTag
      } else if (innerTag instanceof ParsedHedGroup) {
        yield* innerTag.tagIterator()
      }
    }
  }
}

/**
 * A parsed HED string.
 */
class ParsedHedString {
  /**
   * Constructor.
   * @param {string} hedString The original HED string.
   */
  constructor(hedString) {
    /**
     * The original HED string.
     * @type {string}
     */
    this.hedString = hedString
    /**
     * All of the tags in the string.
     * @type ParsedHedTag[]
     */
    this.tags = []
    /**
     * The tag groups in the string.
     * @type ParsedHedGroup[]
     */
    this.tagGroups = []
    /**
     * The tag groups, kept in their original parenthesized form.
     * @type ParsedHedTag[]
     */
    this.tagGroupStrings = []
    /**
     * All of the top-level tags in the string.
     * @type ParsedHedTag[]
     */
    this.topLevelTags = []
    /**
     * The top-level tag groups in the string, split into arrays.
     * @type ParsedHedTag[][]
     */
    this.topLevelTagGroups = []
    /**
     * The definition tag groups in the string.
     * @type ParsedHedGroup[]
     */
    this.definitionGroups = []
  }
}

/**
 * Determine whether a HED string is a group (surrounded by parentheses).
 *
 * @param {string} hedString A HED string.
 */
const hedStringIsAGroup = function (hedString) {
  const trimmedHedString = hedString.trim()
  return (
    trimmedHedString.startsWith(openingGroupCharacter) &&
    trimmedHedString.endsWith(closingGroupCharacter)
  )
}

/**
 * Return a copy of a group tag with the surrounding parentheses removed.
 *
 * @param {string} tagGroup A tag group string.
 */
const removeGroupParentheses = function (tagGroup) {
  return tagGroup.slice(1, -1)
}

/**
 * Split a full HED string into tags.
 *
 * @param {string} hedString The full HED string.
 * @param {Schemas} hedSchemas The collection of HED schemas.
 * @param {int} groupStartingIndex The start index of the group in the full HED string.
 * @returns {[ParsedHedTag[], Array]} An array of HED tags (top-level relative to the passed string) and any issues found.
 */
const splitHedString = function (
  hedString,
  hedSchemas,
  groupStartingIndex = 0,
) {
  const delimiter = ','
  const doubleQuoteCharacter = '"'
  const invalidCharacters = ['{', '}', '[', ']', '~']

  const hedTags = []
  let issues = []
  let groupDepth = 0
  let currentTag = ''
  let startingIndex = 0
  let resetStartingIndex = false
  // Loop a character at a time.
  for (let i = 0; i < hedString.length; i++) {
    if (resetStartingIndex) {
      startingIndex = i
      resetStartingIndex = false
    }
    const character = hedString.charAt(i)
    if (character === doubleQuoteCharacter) {
      // Skip double quotes
      continue
    } else if (character === openingGroupCharacter) {
      // Count group characters
      groupDepth++
    } else if (character === closingGroupCharacter) {
      groupDepth--
    }
    if (groupDepth === 0 && character === delimiter) {
      // Found the end of a tag, so push the current tag.
      if (!utils.string.stringIsEmpty(currentTag)) {
        const parsedHedTag = new ParsedHedTag(
          currentTag.trim(),
          hedString,
          [groupStartingIndex + startingIndex, groupStartingIndex + i],
          hedSchemas,
        )
        hedTags.push(parsedHedTag)
        issues = issues.concat(parsedHedTag.conversionIssues)
      }
      resetStartingIndex = true
      currentTag = ''
    } else if (invalidCharacters.includes(character)) {
      // Found an invalid character, so push an issue.
      issues.push(
        utils.issues.generateIssue('invalidCharacter', {
          character: character,
          index: groupStartingIndex + i,
          string: hedString,
        }),
      )
      if (!utils.string.stringIsEmpty(currentTag)) {
        const parsedHedTag = new ParsedHedTag(
          currentTag.trim(),
          hedString,
          [groupStartingIndex + startingIndex, groupStartingIndex + i],
          hedSchemas,
        )
        hedTags.push(parsedHedTag)
        issues = issues.concat(parsedHedTag.conversionIssues)
      }
      resetStartingIndex = true
      currentTag = ''
    } else {
      currentTag += character
      if (utils.string.stringIsEmpty(currentTag)) {
        resetStartingIndex = true
        currentTag = ''
      }
    }
  }
  if (!utils.string.stringIsEmpty(currentTag)) {
    // Push last HED tag.
    const parsedHedTag = new ParsedHedTag(
      currentTag.trim(),
      hedString,
      [
        groupStartingIndex + startingIndex,
        groupStartingIndex + hedString.length,
      ],
      hedSchemas,
    )
    hedTags.push(parsedHedTag)
    issues = issues.concat(parsedHedTag.conversionIssues)
  }
  return [hedTags, issues]
}

/**
 * Find and parse the group tags in a provided list.
 *
 * @param {(ParsedHedTag|ParsedHedGroup)[]} groupTagsList The list of possible group tags.
 * @param {Schemas} hedSchemas The collection of HED schemas.
 * @param {ParsedHedString} parsedString The object to store parsed output in.
 * @param {boolean} isTopLevel Whether these tag groups are at the top level.
 * @return {Issue[]} The array of issues.
 */
const findTagGroups = function (
  groupTagsList,
  hedSchemas,
  parsedString,
  isTopLevel,
) {
  let issues = []
  const copiedGroupTagsList = groupTagsList.slice()
  copiedGroupTagsList.forEach((tagOrGroup, index) => {
    if (hedStringIsAGroup(tagOrGroup.originalTag)) {
      const tagGroupString = removeGroupParentheses(tagOrGroup.originalTag)
      // Split the group tag and recurse.
      const [nestedGroupTagList, nestedGroupIssues] = splitHedString(
        tagGroupString,
        hedSchemas,
        tagOrGroup.originalBounds[0] + 1,
      )
      const nestedIssues = findTagGroups(
        nestedGroupTagList,
        hedSchemas,
        parsedString,
        false,
      )
      groupTagsList[index] = new ParsedHedGroup(
        tagOrGroup.originalTag,
        nestedGroupTagList,
        tagOrGroup.originalBounds,
        hedSchemas,
      )
      if (isTopLevel) {
        parsedString.tagGroupStrings.push(tagOrGroup)
        parsedString.tagGroups.push(groupTagsList[index])
        parsedString.topLevelTagGroups.push(
          nestedGroupTagList.filter((tagOrGroup) => {
            return tagOrGroup && !Array.isArray(tagOrGroup)
          }),
        )
      }
      issues = issues.concat(nestedGroupIssues, nestedIssues)
    } else if (!parsedString.tags.includes(tagOrGroup)) {
      parsedString.tags.push(tagOrGroup)
    }
  })
  parsedString.definitionGroups = parsedString.tagGroups.filter((group) => {
    return group.isDefinitionGroup
  })
  return issues
}

/**
 * Find top-level tags in a split HED tag list.
 *
 * @param {ParsedHedTag[]} hedTags A list of split HED tags.
 * @param {Schemas} hedSchemas The collection of HED schemas.
 * @param {ParsedHedString} parsedString The object to store sorted output in.
 * @returns {ParsedHedTag[]} The top-level tags from a HED string.
 */
const findTopLevelTags = function (hedTags, hedSchemas, parsedString) {
  const topLevelTags = []
  for (const tagOrGroup of hedTags) {
    if (!hedStringIsAGroup(tagOrGroup.originalTag)) {
      topLevelTags.push(tagOrGroup)
      if (!parsedString.tags.includes(tagOrGroup)) {
        parsedString.tags.push(tagOrGroup)
      }
    }
  }
  return topLevelTags
}

/**
 * Format the HED tags in a list.
 *
 * @param {ParsedHedTag[]|ParsedHedTag[][]} hedTagList An array of unformatted HED tags.
 * @returns {Array} An array of formatted HED tags corresponding to hedTagList.
 */
const formatHedTagsInList = function (hedTagList) {
  for (const hedTag of hedTagList) {
    if (hedTag instanceof Array) {
      // Recurse
      formatHedTagsInList(hedTag)
    } else {
      formatHedTag(hedTag)
    }
  }
}

/**
 * Format an individual HED tag by removing newlines, double quotes, and slashes.
 *
 * @param {ParsedHedTag} hedTag The HED tag to format.
 */
const formatHedTag = function (hedTag) {
  hedTag.originalTag = hedTag.originalTag.replace('\n', ' ')
  let hedTagString = hedTag.canonicalTag.trim()
  if (hedTagString.startsWith('"')) {
    hedTagString = hedTagString.slice(1)
  }
  if (hedTagString.endsWith('"')) {
    hedTagString = hedTagString.slice(0, -1)
  }
  if (hedTagString.startsWith('/')) {
    hedTagString = hedTagString.slice(1)
  }
  if (hedTagString.endsWith('/')) {
    hedTagString = hedTagString.slice(0, -1)
  }
  hedTag.formattedTag = hedTagString.toLowerCase()
}

/**
 * Parse a full HED string into a object of tag types.
 *
 * @param {string} hedString The full HED string to parse.
 * @param {Schemas} hedSchemas The collection of HED schemas.
 * @returns {[ParsedHedString, Issue[]]} The parsed HED tag data and list of issues.
 */
const parseHedString = function (hedString, hedSchemas) {
  const parsedString = new ParsedHedString(hedString)
  const [hedTagList, splitIssues] = splitHedString(hedString, hedSchemas)
  parsedString.topLevelTags = findTopLevelTags(
    hedTagList,
    hedSchemas,
    parsedString,
  )
  const tagGroupIssues = findTagGroups(
    hedTagList,
    hedSchemas,
    parsedString,
    true,
  )
  formatHedTagsInList(parsedString.tags)
  formatHedTagsInList(parsedString.topLevelTags)
  const issues = [].concat(splitIssues, tagGroupIssues)
  return [parsedString, issues]
}

module.exports = {
  ParsedHedTag: ParsedHedTag,
  ParsedHedGroup: ParsedHedGroup,
  ParsedHedString: ParsedHedString,
  hedStringIsAGroup: hedStringIsAGroup,
  removeGroupParentheses: removeGroupParentheses,
  splitHedString: splitHedString,
  formatHedTag: formatHedTag,
  parseHedString: parseHedString,
}
