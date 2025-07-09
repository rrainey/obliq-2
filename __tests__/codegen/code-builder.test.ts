// __tests__/codegen/code-builder.test.ts

import { CCodeBuilder } from '@/lib/codegen/CCodeBuilder'

describe('C Code Builder Utilities', () => {
  describe('Identifier Sanitization', () => {
    test('should pass through valid C identifiers unchanged', () => {
      expect(CCodeBuilder.sanitizeIdentifier('validName')).toBe('validName')
      expect(CCodeBuilder.sanitizeIdentifier('valid_name')).toBe('valid_name')
      expect(CCodeBuilder.sanitizeIdentifier('validName123')).toBe('validName123')
      expect(CCodeBuilder.sanitizeIdentifier('_privateVar')).toBe('_privateVar')
      expect(CCodeBuilder.sanitizeIdentifier('CONSTANT_VALUE')).toBe('CONSTANT_VALUE')
    })

    test('should handle names starting with digits', () => {
      expect(CCodeBuilder.sanitizeIdentifier('123invalid')).toBe('_123invalid')
      expect(CCodeBuilder.sanitizeIdentifier('0startWithZero')).toBe('_0startWithZero')
      expect(CCodeBuilder.sanitizeIdentifier('9lives')).toBe('_9lives')
    })

    test('should replace invalid characters with underscores', () => {
      expect(CCodeBuilder.sanitizeIdentifier('name-with-dashes')).toBe('name_with_dashes')
      expect(CCodeBuilder.sanitizeIdentifier('name.with.dots')).toBe('name_with_dots')
      expect(CCodeBuilder.sanitizeIdentifier('name with spaces')).toBe('name_with_spaces')
      expect(CCodeBuilder.sanitizeIdentifier('name@symbol')).toBe('name_symbol')
      expect(CCodeBuilder.sanitizeIdentifier('name#hash')).toBe('name_hash')
      expect(CCodeBuilder.sanitizeIdentifier('name$dollar')).toBe('name_dollar')
      expect(CCodeBuilder.sanitizeIdentifier('name%percent')).toBe('name_percent')
    })

    test('should handle C keywords by appending underscore', () => {
      // C keywords that should be escaped
      expect(CCodeBuilder.sanitizeIdentifier('int')).toBe('int_')
      expect(CCodeBuilder.sanitizeIdentifier('double')).toBe('double_')
      expect(CCodeBuilder.sanitizeIdentifier('float')).toBe('float_')
      expect(CCodeBuilder.sanitizeIdentifier('char')).toBe('char_')
      expect(CCodeBuilder.sanitizeIdentifier('void')).toBe('void_')
      expect(CCodeBuilder.sanitizeIdentifier('if')).toBe('if_')
      expect(CCodeBuilder.sanitizeIdentifier('else')).toBe('else_')
      expect(CCodeBuilder.sanitizeIdentifier('while')).toBe('while_')
      expect(CCodeBuilder.sanitizeIdentifier('for')).toBe('for_')
      expect(CCodeBuilder.sanitizeIdentifier('return')).toBe('return_')
      expect(CCodeBuilder.sanitizeIdentifier('struct')).toBe('struct_')
      expect(CCodeBuilder.sanitizeIdentifier('typedef')).toBe('typedef_')
      expect(CCodeBuilder.sanitizeIdentifier('static')).toBe('static_')
      expect(CCodeBuilder.sanitizeIdentifier('const')).toBe('const_')
      expect(CCodeBuilder.sanitizeIdentifier('extern')).toBe('extern_')
    })

    test('should handle empty or invalid input', () => {
      expect(() => CCodeBuilder.sanitizeIdentifier('')).toThrow('Invalid name provided for sanitization')
      expect(() => CCodeBuilder.sanitizeIdentifier(null as any)).toThrow('Invalid name provided for sanitization')
      expect(() => CCodeBuilder.sanitizeIdentifier(undefined as any)).toThrow('Invalid name provided for sanitization')
      expect(CCodeBuilder.sanitizeIdentifier('   ')).toBe('___') // Spaces become underscores
    })

    test('should handle special cases', () => {
      expect(CCodeBuilder.sanitizeIdentifier('__reserved__')).toBe('__reserved__')
      expect(CCodeBuilder.sanitizeIdentifier('123')).toBe('_123')
      expect(CCodeBuilder.sanitizeIdentifier('---')).toBe('___')
      expect(CCodeBuilder.sanitizeIdentifier('C++')).toBe('C__')
    })

    test('should handle unicode and special characters', () => {
      expect(CCodeBuilder.sanitizeIdentifier('naïve')).toBe('na_ve')
      expect(CCodeBuilder.sanitizeIdentifier('π_constant')).toBe('__constant')
      expect(CCodeBuilder.sanitizeIdentifier('temperature°C')).toBe('temperature_C')
      expect(CCodeBuilder.sanitizeIdentifier('value€')).toBe('value_')
    })
  })

  describe('Array Declaration Generation', () => {
    test('should generate simple array declarations', () => {
      expect(CCodeBuilder.generateArrayDeclaration('int', 'myArray', [10]))
        .toBe('int myArray[10]')
      expect(CCodeBuilder.generateArrayDeclaration('double', 'values', [5]))
        .toBe('double values[5]')
      expect(CCodeBuilder.generateArrayDeclaration('float', 'data', [100]))
        .toBe('float data[100]')
    })

    test('should generate 2D array declarations', () => {
      expect(CCodeBuilder.generateArrayDeclaration('double', 'matrix', [3, 4]))
        .toBe('double matrix[3][4]')
      expect(CCodeBuilder.generateArrayDeclaration('int', 'grid', [10, 10]))
        .toBe('int grid[10][10]')
      expect(CCodeBuilder.generateArrayDeclaration('float', 'image', [480, 640]))
        .toBe('float image[480][640]')
    })

    test('should generate 3D array declarations', () => {
      expect(CCodeBuilder.generateArrayDeclaration('double', 'tensor', [2, 3, 4]))
        .toBe('double tensor[2][3][4]')
      expect(CCodeBuilder.generateArrayDeclaration('int', 'volume', [5, 5, 5]))
        .toBe('int volume[5][5][5]')
    })

    test('should handle scalar declarations (no dimensions)', () => {
      expect(CCodeBuilder.generateArrayDeclaration('double', 'scalar', []))
        .toBe('double scalar')
      expect(CCodeBuilder.generateArrayDeclaration('int', 'count', []))
        .toBe('int count')
    })

    test('should handle custom types', () => {
      expect(CCodeBuilder.generateArrayDeclaration('custom_t', 'customArray', [20]))
        .toBe('custom_t customArray[20]')
      expect(CCodeBuilder.generateArrayDeclaration('struct Point', 'points', [50]))
        .toBe('struct Point points[50]')
    })

    test('should handle edge cases', () => {
      expect(CCodeBuilder.generateArrayDeclaration('void*', 'pointers', [16]))
        .toBe('void* pointers[16]')
      expect(CCodeBuilder.generateArrayDeclaration('const char*', 'strings', [32]))
        .toBe('const char* strings[32]')
    })
  })

  describe('Struct Member Generation', () => {
    test('should generate basic struct members', () => {
      expect(CCodeBuilder.generateStructMember('int', 'count'))
        .toBe('    int count;')
      expect(CCodeBuilder.generateStructMember('double', 'value'))
        .toBe('    double value;')
      expect(CCodeBuilder.generateStructMember('float', 'temperature'))
        .toBe('    float temperature;')
    })

    test('should generate struct members with comments', () => {
      expect(CCodeBuilder.generateStructMember('int', 'status', [], 'Current status code'))
        .toBe('    int status; /* Current status code */')
      expect(CCodeBuilder.generateStructMember('double', 'velocity', [], 'Velocity in m/s'))
        .toBe('    double velocity; /* Velocity in m/s */')
    })

    test('should generate array struct members', () => {
      expect(CCodeBuilder.generateStructMember('double', 'position', [3], 'Position vector'))
        .toBe('    double position[3]; /* Position vector */')
      expect(CCodeBuilder.generateStructMember('int', 'matrix', [4, 4], '4x4 transformation matrix'))
        .toBe('    int matrix[4][4]; /* 4x4 transformation matrix */')
    })

    test('should handle pointer members', () => {
      expect(CCodeBuilder.generateStructMember('char*', 'name', [], 'Name string'))
        .toBe('    char* name; /* Name string */')
      expect(CCodeBuilder.generateStructMember('void*', 'userData'))
        .toBe('    void* userData;')
    })

    test('should handle const members', () => {
      expect(CCodeBuilder.generateStructMember('const int', 'maxSize', [], 'Maximum size'))
        .toBe('    const int maxSize; /* Maximum size */')
      expect(CCodeBuilder.generateStructMember('const double', 'pi', [], 'Pi constant'))
        .toBe('    const double pi; /* Pi constant */')
    })

  })

  describe('Boolean Expression Generation', () => {
    test('should wrap expressions in ternary operator', () => {
      expect(CCodeBuilder.generateBooleanExpression('x > 5'))
        .toBe('((x > 5) ? 1 : 0)')
      expect(CCodeBuilder.generateBooleanExpression('a == b'))
        .toBe('((a == b) ? 1 : 0)')
      expect(CCodeBuilder.generateBooleanExpression('flag && enabled'))
        .toBe('((flag && enabled) ? 1 : 0)')
    })

    test('should handle complex boolean expressions', () => {
      expect(CCodeBuilder.generateBooleanExpression('(x > 5) && (y < 10)'))
        .toBe('(((x > 5) && (y < 10)) ? 1 : 0)')
      expect(CCodeBuilder.generateBooleanExpression('!disabled || override'))
        .toBe('((!disabled || override) ? 1 : 0)')
      expect(CCodeBuilder.generateBooleanExpression('(a && b) || (c && d)'))
        .toBe('(((a && b) || (c && d)) ? 1 : 0)')
    })

    test('should handle default boolean values', () => {
      expect(CCodeBuilder.generateBooleanExpression('', true))
        .toBe('1')
      expect(CCodeBuilder.generateBooleanExpression('', false))
        .toBe('0')
      expect(CCodeBuilder.generateBooleanExpression(null as any, true))
        .toBe('1')
      expect(CCodeBuilder.generateBooleanExpression(undefined as any, false))
        .toBe('0')
    })

    test('should handle function calls in expressions', () => {
      expect(CCodeBuilder.generateBooleanExpression('isEnabled()'))
        .toBe('((isEnabled()) ? 1 : 0)')
      expect(CCodeBuilder.generateBooleanExpression('checkStatus() == OK'))
        .toBe('((checkStatus() == OK) ? 1 : 0)')
      expect(CCodeBuilder.generateBooleanExpression('getValue() > threshold'))
        .toBe('((getValue() > threshold) ? 1 : 0)')
    })

  })

  describe('Type Parsing', () => {
    test('should parse scalar types', () => {
      const parseType = (type: string) => {
        // This would be a utility method in CCodeBuilder
        const match = type.match(/^(\w+)(\[[\d\[\]]+\])?$/)
        if (!match) return { baseType: type, dimensions: [] }
        
        const baseType = match[1]
        const dimensionStr = match[2]
        const dimensions: number[] = []
        
        if (dimensionStr) {
          const dimMatches = dimensionStr.matchAll(/\[(\d+)\]/g)
          for (const dim of dimMatches) {
            dimensions.push(parseInt(dim[1]))
          }
        }
        
        return { baseType, dimensions }
      }

      expect(parseType('int')).toEqual({ baseType: 'int', dimensions: [] })
      expect(parseType('double')).toEqual({ baseType: 'double', dimensions: [] })
      expect(parseType('float')).toEqual({ baseType: 'float', dimensions: [] })
      expect(parseType('bool')).toEqual({ baseType: 'bool', dimensions: [] })
    })

    test('should parse array types', () => {
      const parseType = (type: string) => {
        const match = type.match(/^(\w+)(\[[\d\[\]]+\])?$/)
        if (!match) return { baseType: type, dimensions: [] }
        
        const baseType = match[1]
        const dimensionStr = match[2]
        const dimensions: number[] = []
        
        if (dimensionStr) {
          const dimMatches = dimensionStr.matchAll(/\[(\d+)\]/g)
          for (const dim of dimMatches) {
            dimensions.push(parseInt(dim[1]))
          }
        }
        
        return { baseType, dimensions }
      }

      expect(parseType('double[3]')).toEqual({ baseType: 'double', dimensions: [3] })
      expect(parseType('int[10]')).toEqual({ baseType: 'int', dimensions: [10] })
      expect(parseType('float[100]')).toEqual({ baseType: 'float', dimensions: [100] })
    })

    test('should parse matrix types', () => {
      const parseType = (type: string) => {
        const match = type.match(/^(\w+)(\[[\d\[\]]+\])?$/)
        if (!match) return { baseType: type, dimensions: [] }
        
        const baseType = match[1]
        const dimensionStr = match[2]
        const dimensions: number[] = []
        
        if (dimensionStr) {
          const dimMatches = dimensionStr.matchAll(/\[(\d+)\]/g)
          for (const dim of dimMatches) {
            dimensions.push(parseInt(dim[1]))
          }
        }
        
        return { baseType, dimensions }
      }

      expect(parseType('double[3][4]')).toEqual({ baseType: 'double', dimensions: [3, 4] })
      expect(parseType('int[2][2]')).toEqual({ baseType: 'int', dimensions: [2, 2] })
      expect(parseType('float[5][10]')).toEqual({ baseType: 'float', dimensions: [5, 10] })
    })
  })

  describe('Code Formatting Helpers', () => {
    test('should generate proper indentation', () => {
      const indent = (level: number) => '    '.repeat(level)
      
      expect(indent(0)).toBe('')
      expect(indent(1)).toBe('    ')
      expect(indent(2)).toBe('        ')
      expect(indent(3)).toBe('            ')
    })

    test('should format multi-line comments', () => {
      const formatComment = (comment: string, indent: string = '') => {
        const lines = comment.split('\n')
        if (lines.length === 1) {
          return `${indent}/* ${comment} */`
        }
        
        let result = `${indent}/*\n`
        for (const line of lines) {
          result += `${indent} * ${line}\n`
        }
        result += `${indent} */`
        return result
      }

      expect(formatComment('Single line comment'))
        .toBe('/* Single line comment */')
      
      expect(formatComment('Multi\nline\ncomment'))
        .toBe('/*\n * Multi\n * line\n * comment\n */')
      
      expect(formatComment('Indented\ncomment', '    '))
        .toBe('    /*\n     * Indented\n     * comment\n     */')
    })

    test('should escape string literals', () => {
      const escapeString = (str: string) => {
        return str
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
      }

      expect(escapeString('simple string')).toBe('simple string')
      expect(escapeString('string with "quotes"')).toBe('string with \\"quotes\\"')
      expect(escapeString('string with\nnewline')).toBe('string with\\nnewline')
      expect(escapeString('string with\ttab')).toBe('string with\\ttab')
      expect(escapeString('string with\\backslash')).toBe('string with\\\\backslash')
    })
  })

  describe('Function Declaration Helpers', () => {
    test('should generate function prototypes', () => {
      const generatePrototype = (returnType: string, name: string, params: string[]) => {
        return `${returnType} ${name}(${params.join(', ')});`
      }

      expect(generatePrototype('void', 'init', []))
        .toBe('void init();')
      expect(generatePrototype('int', 'add', ['int a', 'int b']))
        .toBe('int add(int a, int b);')
      expect(generatePrototype('double', 'calculate', ['double x', 'double y', 'int mode']))
        .toBe('double calculate(double x, double y, int mode);')
    })

    test('should generate function signatures with const', () => {
      const generatePrototype = (returnType: string, name: string, params: string[]) => {
        return `${returnType} ${name}(${params.join(', ')});`
      }

      expect(generatePrototype('void', 'process', ['const double* input', 'double* output']))
        .toBe('void process(const double* input, double* output);')
      expect(generatePrototype('const char*', 'getName', ['void']))
        .toBe('const char* getName(void);')
    })
  })

  describe('Struct Declaration Helpers', () => {
    test('should generate typedef struct declarations', () => {
      const generateTypedefStruct = (name: string, members: string[]) => {
        let result = `typedef struct {\n`
        for (const member of members) {
          result += `    ${member}\n`
        }
        result += `} ${name};`
        return result
      }

      expect(generateTypedefStruct('point_t', ['double x;', 'double y;']))
        .toBe('typedef struct {\n    double x;\n    double y;\n} point_t;')

      expect(generateTypedefStruct('config_t', [
        'int mode;',
        'double threshold;',
        'bool enabled;'
      ])).toBe('typedef struct {\n    int mode;\n    double threshold;\n    bool enabled;\n} config_t;')
    })
  })

  describe('Macro Generation', () => {
    test('should generate simple macros', () => {
      const generateMacro = (name: string, value?: string) => {
        if (value === undefined) {
          return `#define ${name}`
        }
        return `#define ${name} ${value}`
      }

      expect(generateMacro('DEBUG')).toBe('#define DEBUG')
      expect(generateMacro('MAX_SIZE', '100')).toBe('#define MAX_SIZE 100')
      expect(generateMacro('PI', '3.14159265359')).toBe('#define PI 3.14159265359')
    })

    test('should generate function-like macros', () => {
      const generateFunctionMacro = (name: string, params: string[], body: string) => {
        return `#define ${name}(${params.join(', ')}) ${body}`
      }

      expect(generateFunctionMacro('MAX', ['a', 'b'], '((a) > (b) ? (a) : (b))'))
        .toBe('#define MAX(a, b) ((a) > (b) ? (a) : (b))')
      expect(generateFunctionMacro('SQUARE', ['x'], '((x) * (x))'))
        .toBe('#define SQUARE(x) ((x) * (x))')
    })
  })

  describe('Include Guard Generation', () => {
    test('should generate include guards', () => {

      const guards = CCodeBuilder.generateIncludeGuard('my_model.h')
      expect(guards.start).toBe('#ifndef MY_MODEL_H\n#define MY_MODEL_H\n')
      expect(guards.end).toBe('\n#endif /* MY_MODEL_H */\n')

      const guards2 = CCodeBuilder.generateIncludeGuard('complex-name_123.h')
      expect(guards2.start).toBe('#ifndef COMPLEX_NAME_123_H\n#define COMPLEX_NAME_123_H\n')
      expect(guards2.end).toBe('\n#endif /* COMPLEX_NAME_123_H */\n')
    })
  })
})