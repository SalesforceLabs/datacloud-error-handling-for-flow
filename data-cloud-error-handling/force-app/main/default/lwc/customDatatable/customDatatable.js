//myCustomTypeDatatable.js
import LightningDatatable from "lightning/datatable";
import customPicklistTemplateEditable from "./customPicklistEditable.html";
import customPicklistTemplateNonEditable from "./customPicklistNonEditable.html";
import customToggleTemplate from "./customToggle.html";

export default class customDatatableWithPicklist extends LightningDatatable {
  static customTypes = {
    customPicklist: {
      template: customPicklistTemplateNonEditable,
      editTemplate: customPicklistTemplateEditable,
      standardCellLayout: true,
      typeAttributes: ['label', 'placeholder', 'options', 'value', 'context', 'variant','name']
    },
    customToggle: {
      template: customToggleTemplate,
      standardCellLayout: true,
      typeAttributes : ['value', 'context']
    }
  };
}