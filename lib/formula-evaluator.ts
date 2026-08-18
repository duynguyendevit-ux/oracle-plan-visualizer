import { parse, type MathNode } from 'mathjs'

const allowedFunctions = new Set(['SUM', 'AVERAGE', 'MIN', 'MAX', 'ABS', 'ROUND'])
const allowedOperators = new Set(['+', '-', '*', '/', '^', '%'])
const allowedSymbols = new Set([...allowedFunctions, 'PI', 'E'])

function toNumber(value: unknown, label: string) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) throw new Error(`${label} only accepts finite numbers.`)
  return number
}

function validateNode(node: MathNode) {
  if (node.type === 'ConstantNode' || node.type === 'ParenthesisNode') return

  if (node.type === 'OperatorNode') {
    const operator = 'op' in node ? String(node.op) : ''
    if (!allowedOperators.has(operator)) throw new Error(`Operator "${operator}" is not supported.`)
    return
  }

  if (node.type === 'SymbolNode') {
    const name = 'name' in node ? String(node.name).toUpperCase() : ''
    if (!allowedSymbols.has(name)) throw new Error(`Symbol "${name}" is not supported.`)
    return
  }

  if (node.type === 'FunctionNode') {
    const functionName = 'name' in node ? String(node.name).toUpperCase() : ''
    if (!allowedFunctions.has(functionName)) throw new Error(`Function "${functionName}" is not supported.`)
    return
  }

  throw new Error(`Formula element "${node.type}" is not supported.`)
}

export function evaluateFormula(input: string) {
  const expression = input.trim().replace(/^=/, '')
  if (!expression) throw new Error('Enter a formula before evaluating it.')
  if (expression.length > 2_000) throw new Error('Formula is too long. Maximum length is 2,000 characters.')

  const node = parse(expression)
  node.traverse(validateNode)

  const scope = {
    SUM: (...values: unknown[]) => values.reduce<number>((sum, value) => sum + toNumber(value, 'SUM'), 0),
    AVERAGE: (...values: unknown[]) => {
      if (values.length === 0) throw new Error('AVERAGE requires at least one value.')
      return values.reduce<number>((sum, value) => sum + toNumber(value, 'AVERAGE'), 0) / values.length
    },
    MIN: (...values: unknown[]) => Math.min(...values.map((value) => toNumber(value, 'MIN'))),
    MAX: (...values: unknown[]) => Math.max(...values.map((value) => toNumber(value, 'MAX'))),
    ABS: (value: unknown) => Math.abs(toNumber(value, 'ABS')),
    ROUND: (value: unknown, precision: unknown = 0) => {
      const digits = toNumber(precision, 'ROUND')
      if (!Number.isInteger(digits) || digits < 0 || digits > 12) throw new Error('ROUND precision must be an integer from 0 to 12.')
      const factor = 10 ** digits
      return Math.round(toNumber(value, 'ROUND') * factor) / factor
    },
    PI: Math.PI,
    E: Math.E,
  }

  const result = node.compile().evaluate(scope)
  return toNumber(result, 'Formula')
}
