/*
code is a string64 in the format  issuer:value.
Examples are:
   ucalgary:duplicate
   SCT:87878005
They categorize series, annotations etc into types.
*/
interface StudyRef {
    studyInstanceUID: string; // 64 characters max
}

interface SeriesRef extends Partial<StudyRef> {
    seriesInstanceUID: string; // 64 characters max
}

interface InstanceRef extends Partial<SeriesRef> {
    sopInstanceUID: string; // 64 characters max
    frame?: number;
}

// Codes are strings in the form "assigner:value"
type Code = string;

interface SelectionItem {
    selectionCodes: Code[];
    site?: Code;
    finding?: Code;
    label?: string;
    isInView?: boolean;
}

interface InstanceSelection extends InstanceRef, SelectionItem {}

interface SeriesSelection extends SelectionItem, SeriesRef {
    instances: InstanceSelection[];
}

interface StudySelection extends SelectionItem, StudyRef {
    series: SeriesSelection[];
}

type AnySelection = InstanceSelection | SeriesSelection | StudySelection;

type AnyRef = InstanceRef | SeriesRef | StudyRef;

interface Algorithm {
    algorithmName: string; // may be "userGenerated" for a user created annotation
    algorithmVersion?: string;
    params?: any;
}

interface Job extends Algorithm {
    requestDateTime: string; // ISO formatted - ex. '2022-05-07T01:34:22.037Z'
    jobId: string;
    jobStatus: "STARTED" | "COMPLETED" | "FAILED";
    jobProgress: number; // progress indicator from 0 - 100 
}

interface Point {
    x: number;
    y: number;
    z?: number;
}

interface Annotation extends SelectionItem {
    location: AnyRef[];
    algorithm?: Algorithm;
    isClosed?: boolean;
    type: string;
    points: Point[];
    dataURL: string;
    statistics: any;  // TODO - define this a bit better - things like area, length, units, probability etc
}

export interface APIInitiate {
    algorithm: Algorithm;
    structuredReport?: InstanceSelection;
    selection: AnySelection[];
    annotations: Annotation[];
}

export interface APIResponse {
    selection: StudyRef[];
    job: Job;
    annotations: Annotation[];
}
