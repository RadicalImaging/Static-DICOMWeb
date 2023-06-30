# -*- coding: utf-8 -*-
"""
Created on Wed Jun 28, 2023

@author: rathwale
"""

import pydicom
import numpy as np
import os, sys, time
import argparse

# DICOM reader errors
NO_ERROR = 0
INPUT_DATA_NOT_MULTIFRAME = 1
INPUT_DATA_NOT_READABLE = -1
INPUT_DATA_INVALID = -2
WRITE_ERROR = -4

def convert_multiframe_to_multislice(dicom_file, output_directory, verboseLevel):
    # Load the DICOM file
    ds = pydicom.dcmread(dicom_file)
    ds.remove_private_tags()
    # Extract pixel data from the DICOM file
    pixel_array = ds.pixel_array
    
    # Determine the number of frames and slices
    if hasattr(ds, "NumberOfSlices"): num_slices = ds.NumberOfSlices
    if hasattr(ds, "NumberOfFrames"): num_slices = ds.NumberOfFrames
   
    # Extract the PerFrameFunctionalGroupsSequence
    per_frame_sequences = ds.PerFrameFunctionalGroupsSequence
    orig_sopInstanceUID = ds.SOPInstanceUID
    # Create the output directory if it doesn't exist
    os.makedirs(output_directory, exist_ok=True)
    # Save each slice as a separate DICOM file
    for i in range(num_slices):
        # Set the output filename
        slice_sopInstanceUID = str(orig_sopInstanceUID) + f".{i+1}"
        filename = str(slice_sopInstanceUID) + ".dcm"
        output_filename = os.path.join(output_directory, filename)

        # Create a new DICOM dataset for the slice
        slice_ds = pydicom.Dataset()
        
        # Copy relevant metadata from the original dataset
        for elem in ds:
            if elem.tag == (0x7FE0, 0x0010):  # Pixel Data element
                continue  # Skip copying pixel data element
            if elem.VR in ('SQ'):
                continue 
            slice_ds.add(elem)

        # Set the specific slice attributes
        slice_ds.InstanceNumber = i + 1
        slice_ds.NumberOfFrames = 1
        slice_ds.SOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
        slice_ds.SOPInstanceUID = slice_sopInstanceUID 

        # Extract IPP and IOP from the PerFrameFunctionalGroupsSequence
        frame_sequence = per_frame_sequences[i]
        slice_ds.ImagePositionPatient = frame_sequence.PlanePositionSequence[0].ImagePositionPatient
        slice_ds.ImageOrientationPatient = frame_sequence.PlaneOrientationSequence[0].ImageOrientationPatient
        
        # Get the slice's pixel data from the pixel array
        slice_data = pixel_array[i]
        slice_ds.Rows, slice_ds.Columns = slice_data.shape
        slice_ds.PixelData = slice_data.tobytes()
        
        # Populate required values for file meta information
        # file_meta = pydicom.dataset.FileMetaDataset()
        file_meta = ds.file_meta
        file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
        file_meta.MediaStorageSOPInstanceUID = slice_ds.SOPInstanceUID
        file_ds = pydicom.dataset.FileDataset(
            output_filename,
            slice_ds,
            file_meta=file_meta,
            preamble=ds.preamble
        )
    
        if(verboseLevel >= 3):
            print("INFO:Writing %s" % (output_filename))
            
        try:
            file_ds.save_as(output_filename)
        except IOError as e:
            print("ERROR:File write error ({0}): {1}, {2}".format(e.errno, e.strerror, output_filename))
            sys.exit(WRITE_ERROR)
        except: #handle other exceptions such as attribute errors
            print("ERROR:Unexpected error:", sys.exc_info()[0])
            raise
        if verboseLevel >= 1:
            print(f"Saved slice {i+1}/{num_slices} as {output_filename}")

input_dicom_file = ""
if __name__ == "__main__":
    
    parser = argparse.ArgumentParser(
        prog = "DICOM MultiFrame to MultiSlice Converter",
        description="Reads in DICOM file and convert the data to a multislice - number of output slices. (c) 2023 iSchemaView, Inc.")
    parser.add_argument(
        "-id",
        "--input_directory",
        help="If input_directory is not specified, current directory is used",
        default = "."
    )
    parser.add_argument(
        "-od",
        "--output_directory",
        help="If output directory is not specified, value for input directory is used",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        help="verbosity level (0=no output, 1=some output, 2=all output)",
        choices = [0,1,2,3,4],
        default=1,
        action='store',
        required = False,
        type = int
    )

    args = parser.parse_args()

    verboseLevel = args.verbose

    # current directory by default
    inputDirName = args.input_directory
    if not os.path.exists(inputDirName):
        print("ERROR:Input Directory does not exist %s" % (inputDirName))
        sys.exit(INPUT_DATA_INVALID)

    outputDirName = inputDirName
    if args.output_directory:
        outputDirName = args.output_directory
        
    if not os.path.exists(outputDirName):
        os.makedirs(outputDirName)

    if verboseLevel >= 1:
        print("INFO:Reading input DICOM files from directory %s" % (inputDirName))
        
    filenames = list()
    for [root, dirs, files] in os.walk(inputDirName):
        for f in files:
            fn = os.path.join(root, f)
            if fn.endswith('.dcm'):
                ds = pydicom.dcmread(fn)
                if hasattr(ds, "NumberOfFrames"):
                    if ds.NumberOfFrames <= 1:
                        print("Not a Multi Frame DICOM!!")
                        sys.exit(INPUT_DATA_NOT_MULTIFRAME)
                    else:                        
                        inputDicomFile = fn
                        _ds = pydicom.dcmread(fn, stop_before_pixels = True)
                        if not _ds.Modality in ['CT', 'MR', 'PET']:
                            print("INFO:Modality check FAIL!!")
                            sys.exit(INPUT_DATA_INVALID)
                        print("INFO:Modality check PASS - CT, MR, PET!!")
                else:
                    print("Not a Multi Frame DICOM!!")
                    sys.exit(INPUT_DATA_NOT_MULTIFRAME)
        break
try:
    start = time.time()

    convert_multiframe_to_multislice(inputDicomFile, outputDirName, verboseLevel)
    end = time.time()
    elapsed_time = end - start
    print("INFO:TIME Taken in secs (after conversion) : %s" % (elapsed_time))
except Exception as e:
    print("ERROR:Multislice conversion error: {0}, {1}".format(inputDicomFile, outputDirName))
    sys.exit(INPUT_DATA_INVALID)
sys.exit(0)