# Design

* The API is based on streams, but currently reads each DICOM file into memory one at a time
* TODO - make the API fully streams based, handling components as they are read
  * Allows optimization of implementation to minimize memory use
  * Enables higher performance "on the fly" implementations
* The library is broken up into listeners for certain event types, allowing insertion of various changes at different locations.
  * Easier to comprehend
  * Lower barrier for new collaborators
  * Lower chance of bugs
  * Easier to build more complex systems from
* Built to be extensible
  * Hooks to transform data (the hooks exist, but may need to be improved to be more obvious)
    * Implement work arounds for non standard compliant data sets
    * Implement custom logic (e.g. re-compression of image frames to a proprietary or other format)
    * Implement de-identification
    * Implement de-duplication