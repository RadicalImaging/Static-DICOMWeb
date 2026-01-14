declare module 'dcmjs' {
  export class DicomMetaDictionary {
    static naturalizeDataset(dataset: any): any;
    static denaturalizeDataset(dataset: any, nameMap?: any): any;
    static namifyDataset(dataset: any): any;
    static cleanDataset(dataset: any): any;
    static punctuateTag(rawTag: string): string;
    static unpunctuateTag(tag: string): string;
    static parseIntFromTag(tag: string): number;
    static tagAsIntegerFromName(name: string): number | undefined;
    static uid(): string;
    static date(): string;
    static time(): string;
    static dateTime(): string;
  }

  export interface DcmjsData {
    DicomMetaDictionary: typeof DicomMetaDictionary;
    [key: string]: any;
  }

  export interface Dcmjs {
    data: DcmjsData;
    [key: string]: any;
  }

  const dcmjs: Dcmjs;
  export default dcmjs;
}
