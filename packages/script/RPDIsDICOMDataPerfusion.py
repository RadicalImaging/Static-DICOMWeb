# -*- coding: utf-8 -*-
"""
Created on Tue Apr 11 09:55:11 2023

@author: mstraka
"""

import os, sys, time
from typing import List 
import pydicom
import numpy as np
import SimpleITK as sitk
import argparse
import re


# DICOM reader errors
NO_ERROR = 0
INPUT_DATA_NOT_READABLE = -1
INPUT_DATA_INVALID = -2
WRITE_ERROR = -4
#EXCEPTION = -5
#INPUT_DATA_INVALID_SIZE = -7


def read_filelist(filelist_filename) -> List[str]:
   
    ''' 
    Read a list representing list of DICOM objects to process
    from a text file.
    Input: filename
    Output: list of non-empty lines in the file
    '''
    
    fnlist = []
    try:
        with open(filelist_filename, 'r') as fp:
            for line in fp:
                line = line.strip()
                if line != "":
                    fnlist.append(line)
    except IOError as e:
        print("File read error({0}): {1}".format(e.errno, e.strerror))
        raise
    except: #handle other exceptions such as attribute errors
        print("Unexpected error:", sys.exc_info()[0])
        raise
    return fnlist


class RPDReadDICOM2(object):
    def __init__(self, verbose_level = 3):
        
        ''' 
        Initializes the object
        
        Input:
            verbose level is verbosity of actions (default 3)
            dcmdjpeg is pathname to the decompressor (dcmdjpeg from DCMTK)
        '''

        self.dicom_files = []
        self.interslice_distance_list = []
        self.dimensions = []
        self.volume = None
        self.voxel_spacing = None
        self.volume_origin = None
        self.volume_direction = None
        self.interslice_distance_list = []
        self.interslice_distance_list_orig = []
        self.slice_thickness_list = []
        self.slice_thickness_list_orig = []
        self.ipp_list_np = None
        self.ipp_list_np_orig = None
        self.iop_list_np = None
        self.iop_list_np_orig = None
        self.apply_rescale = True
        self.gantry_tilt_correction_needed = False        
        self.header1 = None
        self.verbose_level = verbose_level
        self.is_enhanced_ct = None
        self.scan_axis = None
        self.acceptable_pos_difference = 0.2 # in mm

            
    def find_tag_recursive(self, ds, tagKeyword):
        '''
        Finds a specific DICOM tag in the input DICOM dataset,
        also recursively in sequences.
        
        Input:
            ds: DICOM dataset
            tagKeyword: name of the DICOM tag to search for
        Output:
            List of tags (tag  + value) in a list
        '''
        

        list_tags = []
    
        for tag in ds:
            if tag.VR == 'SQ':                
                for i in range(int(tag.VM)):                    
                    list2 = self.find_tag_recursive(tag[i], tagKeyword)
                    list_tags.extend(list2)
            
            if tag.keyword == tagKeyword:
                list_tags.append(tag)
        
        return list_tags


    def read_from_list(self, dicom_files: List[str]) -> int:

        '''
        Reads a volume from a set of DICOM files.
        Checks for consistency of input data and missing slices.
        Will decompress input DICOMs if compressed (via dcmdjpeg)
        
        Input:
            list of DICOM files
            is_mask is true if possible resamplings should be done with nearest neighbour interpolation
        
        Output:
            sets many member variables
            the read volume is in self.volume
        
        '''        

        self.dicom_files = dicom_files

        if len(dicom_files) == 0:
            print("RPDPyDcm: Input list empty", file=sys.stderr)
            return INPUT_DATA_INVALID
        
        if self.verbose_level >= 2:
            print("RPDPyDcm: Loading " + str(len(dicom_files)) + " DICOM file(s) ...")

        slice_position_list = []
        instance_nr_list = []                
        number_of_frames = 0
        table_position_list = []
        self.scan_axis = None  

        # in the first loop, read all headers to allow data sorting
        # also, ignore inappropriate DICOM objects here, so the target
        # list only has valid CT slices
        
        for i, dicom_file in enumerate(self.dicom_files):
            
            if self.verbose_level >= 4:
                print("Analyzing file %s" % (dicom_file))
            
            try:
                dcm1 = pydicom.read_file(dicom_file, stop_before_pixels=True)
            except IOError as e:
                print("Warning: File read error ({0}): {1}, {2}".format(e.errno, e.strerror, dicom_file),
                      file=sys.stderr)
                #return INPUT_DATA_NOT_READABLE
                continue
            except: #handle other exceptions 
                print("Warning: Unexpected error: {0}, {1}".format(sys.exc_info()[0], dicom_file),
                      file=sys.stderr)
                #return INPUT_DATA_NOT_READABLE
                continue

            ts = dcm1.file_meta.TransferSyntaxUID
            if ts.is_compressed:
                if self.verbose_level >= 4:
                    print("File is compressed with transfer syntax %s (%s)" % (str(ts), ts.name))
            

            is_enhanced_ct = False
            # CTImageStorageClass 1.2.840.10008.5.1.4.1.1.2
            # EnhancedCTImageStorageClass   1.2.840.10008.5.1.4.1.1.2.1
            if hasattr(dcm1, 'SOPClassUID'):            
                sop_class_uid = str(getattr(dcm1, 'SOPClassUID'))
                if sop_class_uid == '1.2.840.10008.5.1.4.1.1.2':

                    is_enhanced_ct = False
                elif sop_class_uid == '1.2.840.10008.5.1.4.1.1.2.1':
                    is_enhanced_ct = True
                elif sop_class_uid == '1.2.840.10008.5.1.4.1.1.13.1.1': # XA 3D Angiographic
                    is_enhanced_ct = True
               

            number_of_frames = 0
            if dcm1.get("NumberOfFrames") is not None:
                number_of_frames = int(dcm1["NumberOfFrames"].value)
                
            
            if is_enhanced_ct == False:
                has_ipp = False
                has_iop = False
                            
                axis = None
                if hasattr(dcm1, 'ImageOrientationPatient'):
                    iop = getattr(dcm1, 'ImageOrientationPatient')
                    iop1 = np.array(iop[0:3])
                    iop2 = np.array(iop[3:6])
                    iop3 = np.cross(iop1, iop2)
    
                    axis = np.argmax(abs(iop3))
                    has_iop = True
    
                if (axis is not None) and (self.scan_axis is None):
                    self.scan_axis = axis
    
                pos = 0
                inst_nr = 0
                series_instance_uid = ''
                posDefined = False
                has_inst_nr = False
                has_position = False
                
                image_nx = 0
                image_ny = 0
                
                if hasattr(dcm1, 'ImagePositionPatient'):
                    ipp = getattr(dcm1, 'ImagePositionPatient')
                    if len(ipp) >= (axis+1):
                        pos = float(ipp[axis])
                        posDefined = True
                        has_position = True
                        has_ipp = True
    
                if not posDefined:
                    if hasattr(dcm1, 'SliceLocation'):
                        pos = float(getattr(dcm1, 'SliceLocation'))
                        posDefined = True
                        has_position = True
    
                if hasattr(dcm1, 'InstanceNumber'):            
                    inst_nr = float(getattr(dcm1, 'InstanceNumber'))
                    has_inst_nr = True
                    if not posDefined:
                        pos = inst_nr
                        posDefined = True
                        has_position = True
                if hasattr(dcm1, 'TablePosition'):
                    table_pos = float(getattr(dcm1, 'TablePosition'))
                    table_position_list.append(table_pos)
                
        
                if hasattr(dcm1, 'ImageType'):            
                    image_type_str = str(getattr(dcm1, 'ImageType'))                
                    match1 = re.search("LOCALIZER|SCOUT", image_type_str)
                    if match1:
                        # ignore localizer/scout files
                        continue
                
                if hasattr(dcm1, 'SeriesInstanceUID'):            
                    series_instance_uid = str(getattr(dcm1, 'SeriesInstanceUID'))                
                    
                if hasattr(dcm1, 'Columns'):
                    image_nx = int(getattr(dcm1, 'Columns'))
                if hasattr(dcm1, 'Rows'):
                    image_ny = int(getattr(dcm1, 'Rows'))
                
                if not has_ipp:
                    print('File %s does not have a valid ImagePositionPatient tag, ignoring.' % (dicom_file), file=sys.stderr)
                if not has_iop:
                    print('File %s does not have a valid ImageOrientationPatient tag, ignoring.' % (dicom_file), file=sys.stderr)
                if not has_inst_nr:
                    print('File %s does not have a valid InstanceNumber tag, ignoring.' % (dicom_file), file=sys.stderr)
                if not has_position:
                    print('File %s does not have a valid location information, ignoring.' % (dicom_file), file=sys.stderr)
                
                
                if has_inst_nr \
                   and has_position \
                   and has_iop \
                   and has_ipp:
                    
                    slice_position_list.append((pos,i, series_instance_uid, 
                                                dicom_file, ts, is_enhanced_ct, number_of_frames))
                    instance_nr_list.append((inst_nr, i, image_nx, image_ny))     
            elif (is_enhanced_ct == True) and (number_of_frames > 0):
                # EnhancedCT:
                    
                pos = 0
                inst_nr = 0
                
                image_nx = 0
                image_ny = 0
                
                has_ipp = False
                list1 = self.find_tag_recursive(dcm1, 'ImagePositionPatient')
                if len(list1) == number_of_frames:
                    has_ipp = True
                    
                has_iop = False
                list2 = self.find_tag_recursive(dcm1, 'ImageOrientationPatient')
                if len(list2) == number_of_frames:
                     has_iop = True
                
                # list1 = self.find_tag_recursive(dcm1, 'Columns')
                # if len(list1) > 0:
                #     image_nx = int(list1[0].value)
                
                # list1 = self.find_tag_recursive(dcm1, 'Rows')
                # if len(list1) > 0:
                #     image_ny = int(list1[0].value)
                
                # list1 = self.find_tag_recursive(dcm1, 'TablePosition')
                # if len(list1) == number_of_frames:
                #     table_position_list = [j.value for j in list1]
                
                # CTImageStorageClass 1.2.840.10008.5.1.4.1.1.2
                # EnhancedCTImageStorageClass   1.2.840.10008.5.1.4.1.1.2.1

                        
                if hasattr(dcm1, 'ImageType'):            
                    image_type_str = str(getattr(dcm1, 'ImageType'))                
                    match1 = re.search("LOCALIZER|SCOUT", image_type_str)
                    if match1:
                        #ignore such volume
                        continue
                
                series_instance_uid = None
                if hasattr(dcm1, 'SeriesInstanceUID'):            
                    series_instance_uid = str(getattr(dcm1, 'SeriesInstanceUID'))                
                                
                if not has_ipp:
                    print('File %s does not have a valid ImagePositionPatient tag, ignoring.' % (dicom_file), file=sys.stderr)
                # if not has_iop:
                #     print('File %s does not have a valid ImageOrientationPatient tag, ignoring.' % (dicom_file), file=sys.stderr)
                
                
                if has_iop and has_ipp:
                    
                    #slice_position_list.append((pos,i, series_instance_uid, 
                    #                            dicom_file, ts, is_enhanced_ct, number_of_frames))
                    # instance_nr_list.append((inst_nr, i, image_nx, image_ny))
                    # break
                
                    iop = list2[0]
                    iop1 = np.array(iop[0:3])
                    iop2 = np.array(iop[3:6])
                    iop3 = np.cross(iop1, iop2)
    
                    axis = np.argmax(abs(iop3))
                    
                    if (axis is not None) and (self.scan_axis is None):
                        self.scan_axis = axis
                
                    for item in list1:
                        
                        pos1 = float(item[axis])
                        
                        slice_position_list.append((pos1,i, series_instance_uid, 
                                                    dicom_file, ts, is_enhanced_ct, 1))
                
            else:
                print("Invalid DICOM file (EnhancedCTImageStorage SOP Class but zero NumberOfFrames): %s" % 
                      (dicom_file), file=sys.stderr)
                continue

        # all inappropriate DICOM files were ignored (e.g. localizers)
        # if nothing was left to read, then stop
        if len(slice_position_list) == 0:
            print('No valid CT slices found in the input list.', file=sys.stderr)
            return INPUT_DATA_INVALID
        
        
        # now, do some data consistency checks

        slice_position_list = sorted(slice_position_list)
        instance_nr_list = sorted(instance_nr_list)
        
        self.slice_position_dict = dict()
        self.slice_position_dict[slice_position_list[0][0]] = 1
        
        for i in range(1, len(slice_position_list)):
            
            min_diff = 1e8
            min_diff_key = None
            current_position = slice_position_list[i][0]
            
            for k in self.slice_position_dict.keys():
                diff = np.abs(current_position - k)
                if diff < min_diff:
                    min_diff = diff
                    min_diff_key = k
            
            if min_diff <= self.acceptable_pos_difference:
                self.slice_position_dict[min_diff_key] = self.slice_position_dict[min_diff_key] + 1
            else:
                self.slice_position_dict[current_position] = 1
            
        
        # has_more_than_required_number_of_scans_at_location = False
        
        # for k in slice_position_dict.keys():
        #     if slice_position_dict[k] >= required_number_of_scans_at_location):
        #         has_more_than_required_number_of_scans_at_location = True
        #         break

        return NO_ERROR


class Range(object):
    def __init__(self, start, end):
        self.start = start
        self.end = end

    def __eq__(self, other):
        return self.start <= other <= self.end

    def __contains__(self, item):
        return self.__eq__(item)

    def __iter__(self):
        yield self
  
        


if __name__ == "__main__":
    
    parser = argparse.ArgumentParser(
        prog = "DICOM IsDataPerfusion",
        description="Reads in DICOM series and determines if the input series/folder represents CT perfusion / 4D data. (c) 2023 iSchemaView, Inc.")
    
    # the order of reading is following:
    # if -fl is specified, read from there. If not:
    # if -id is specified, read from there. If not:
    # read from current working directory
    
    parser.add_argument(
        "-id",
        "--input_directory",
        help="If input_directory is not specified, current directory is used",
        default = "."
    )
    parser.add_argument(
        "-fl",
        "--filelist",
        help="input file list containing references to input DICOM files",
    )
    parser.add_argument(
        "-nt",
        "--number_of_timepoints",
        help="Minimum number of timepoints in the data to be considered perfusion",
        action='store',
        required = False,
        choices=range(2, 1000),
        default=9,
        type = int
    )
    parser.add_argument(
        "-pd",
        "--position_difference",
        help="Maximum allowed difference/variation in slice position to be considered the same position",
        action='store',
        required = False,
        choices=Range(0.01, 50.0),
        default=0.2,
        type = float
    )
     
    parser.add_argument(
        "-v",
        "--verbose",
        help="verbosity level (0=no output, 1=some output, 2=all output)",
        choices = [0,1,2,3,4],
        default=2,
        action='store',
        required = False,
        type = int
    )
    
    
    args = parser.parse_args()

    # current directory by default
    inputDirName = args.input_directory
    
    if args.filelist is None:
        
        if not os.path.exists(inputDirName):
            print("Directory %s does not exist or is not accesible" % (inputDirName))
            sys.exit(INPUT_DATA_NOT_READABLE)
        
        if args.verbose >= 1:
            print("Reading input DICOM files from directory %s" % (inputDirName))
        
        filenames = list()
        for [root, dirs, files] in os.walk(inputDirName):
            for f in files:
                fn = os.path.join(root, f)
                filenames.append(fn)
            break
        
        if len(filenames) == 0:
            print("Input directory %s does not contain any files" % (inputDirName), file=sys.stderr)
            sys.exit(INPUT_DATA_NOT_READABLE)
    else:
        
        if args.verbose >= 1:
            print("Reading input DICOM files via %s" % (args.filelist))
        
        if not os.path.exists(args.filelist):
            print("File %s does not exist or is not accessible" % (args.filelist), file=sys.stderr)
            sys.exit(INPUT_DATA_NOT_READABLE)

        filenames = read_filelist(args.filelist)
        if len(filenames) == 0:
            print("File %s is empty or not properly formatted" % (args.filelist), file=sys.stderr)
            sys.exit(INPUT_DATA_NOT_READABLE)


    
    time0 = time.time()
    
    reader = RPDReadDICOM2(verbose_level = args.verbose)
    
    if (hasattr(args, 'position_difference')) and \
       (args.position_difference is not None) and \
       (args.position_difference > 0.0):
           reader.acceptable_pos_difference = args.position_difference
           
    retcode1 = reader.read_from_list(filenames)
    
    if retcode1 != 0:
        print("DICOM data read error", file=sys.stderr)
        sys.exit(INPUT_DATA_NOT_READABLE)
    
    time1 = time.time()
    if args.verbose >= 2:
        print("Reading the data took %.1f seconds" % (time1-time0))
    
    
    has_required_number_of_scans_at_location = False
    
    number_of_timepoints_required = 9
    if (hasattr(args, 'number_of_timepoints')) and \
       (args.number_of_timepoints > 0):
           number_of_timepoints_required = args.number_of_timepoints
    
    max_timepoints_available = 0
    #min_timepoints_available = 1e8
    for k in reader.slice_position_dict.keys():
        
        cnt1 = reader.slice_position_dict[k]
        
        if cnt1 > max_timepoints_available:
            max_timepoints_available = cnt1
            
        # if cnt1 < min_timepoints_available:
        #     min_timepoints_available = cnt1
            
        if reader.slice_position_dict[k] >= number_of_timepoints_required:
            has_required_number_of_scans_at_location = True
      
    time2 = time.time()
    
    if args.verbose >= 2:
        print("The whole data processing took %.1f seconds" % (time2-time0))

  
    if(args.verbose >= 1):
        if has_required_number_of_scans_at_location:
            print("The data has at least %d scans at a certain location (maximum number of available timepoints is %d), likely perfusion data" \
                  % (number_of_timepoints_required, 
                     max_timepoints_available))
        else:
            print("The data does not have at least %d scans at a certain location (maximum number of available timepoints is %d), unlikely perfusion data" \
                  % (number_of_timepoints_required, 
                     max_timepoints_available ))
          
    if has_required_number_of_scans_at_location:
        sys.exit(0)
    else:
        sys.exit(1)
