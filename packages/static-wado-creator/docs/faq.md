# FAQ

* Q: Why doesn't this library support STOW-RS or QIDO-RS?
* A: This library is centered around the creation of DICOMweb data from DICOM part 10.  As such, it provides all the building blocks for implementing a STOW-RS or QIDO-RS version, but isn't a DICOMweb service itself.

* Q: Why does this library support NodeJS and not browsers?
* A: It is expected that this library would be primarily used on the server side.  Some of the libraries dependent on the node performance, for example, hashing is fast using node-object-hash, which relies on nodejs functionality.

* Q: How can I get the original transfer syntax UID?
* A: The original transfer syntax UID can be retrieved from the AvailableTransferSyntaxUID, which is stored in the instances query as well as in the series level metadata.

