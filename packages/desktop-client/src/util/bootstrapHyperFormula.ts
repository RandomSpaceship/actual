import {
  CustomFunctionsPlugin,
  customFunctionsTranslations,
} from '@actual-app/core/shared/formulas/customFunctions';
import {
  TableFunctionsPlugin,
  tableFunctionsTranslations,
} from '@actual-app/core/shared/formulas/tableFunctions';
import { HyperFormula } from 'hyperformula';
import enUS from 'hyperformula/i18n/languages/enUS';

export function bootstrapHyperFormula() {
  if (!HyperFormula.getRegisteredLanguagesCodes().includes('enUS')) {
    HyperFormula.registerLanguage('enUS', enUS);
  }
  HyperFormula.registerFunctionPlugin(
    CustomFunctionsPlugin,
    customFunctionsTranslations,
  );
  // After the HyperFormula functions, so that its FILTER replaces theirs
  HyperFormula.registerFunctionPlugin(
    TableFunctionsPlugin,
    tableFunctionsTranslations,
  );
}
