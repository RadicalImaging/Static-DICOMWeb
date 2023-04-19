# -*- coding: utf-8 -*-
"""
Created on Mon Apr 3 08:26:12 2023

@author: mstraka
"""

import os, sys, time
from typing import List 
import pydicom
import numpy as np
import SimpleITK as sitk
import argparse
import re

ISCHEMAVIEW_UID_PREFIX = "1.3.6.1.4.1.39822"

# DICOM reader errors
NO_ERROR = 0
INPUT_DATA_NOT_READABLE = -1
INPUT_DATA_INVALID = -2
WRITE_ERROR = -4
WITHIN_THRESHOLD = 999
#EXCEPTION = -5
#INPUT_DATA_INVALID_SIZE = -7

def is_dicom_3Dable(filelist): # returns volume, and pydicom header/ds
    for fn in filelist:
        try:
            start = time.time()
            print("INFO (is_dicom_3Dable): Reading %s" % (fn))

            ds = pydicom.dcmread(fn, stop_before_pixels = True)

            print("DICOM Validation for Study/Series => %s/%s" % (ds.StudyInstanceUID, ds.SeriesInstanceUID))

            imageType = ds.ImageType
            matches = ['LOCALIZER', 'SCOUT', 'SECONDARY']
            if any( x in imageType for x in matches):
                print("ImageType check FAIL!!")
                return False
            print("ImageType check PASS!!")

            if not ds.Modality in ['CT', 'MR', 'PET']:
                print("Modality check FAIL!!")
                return False
            print("Modality check PASS!!")
            
            if not hasattr(ds, "InstanceNumber"):
                if hasattr(ds, 'NumberOfFrames'):
                    if ds.NumberOfFrames <= 1:
                        print("Multi Frames check FAIL!!")
                        return False
                    else:
                        print("Multi Frames check PASS!!")
                        return True
                print("Instance Number check FAIL!!")
                return False
            print("Instance Number check PASS!!")
            return True

        except Exception:
            filelist.remove(fn)
            print("ERROR (is_dicom_3Dable):Exception Occured while reading file =>%s" % (fn))
            continue
        end = time.time()
        elapsed_time = end - start
        print("TIME Taken in secs (is_dicom_3Dable) : %s" % (elapsed_time))
    return False

def checkThreshold(filelist, threshold): # returns volume, and pydicom header/ds
    for fn in filelist:
        try:
            start = time.time()
            print("INFO (checkThreshold): Reading %s" % (fn))

            ds = pydicom.dcmread(fn, stop_before_pixels = True)
            if hasattr(ds, 'NumberOfFrames'):
                no_of_frames = ds.NumberOfFrames
                if no_of_frames <= threshold:
                    print("Series has less frames (%s) than threshold (%s)!!" % (no_of_frames, threshold))
                    return False
                else:
                    return True
                    
            if len(filelist) <= threshold:
                return False

            return True

        except Exception:
            filelist.remove(fn)
            print("ERROR (checkThreshold):Exception Occured while reading file =>%s" % (fn))
            continue
        end = time.time()
        elapsed_time = end - start
        print("TIME Taken in secs (checkThreshold) : %s" % (elapsed_time))
    return False

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


class RPDReadDICOM(object):
    def __init__(self, working_directory, verbose_level = 3):
        
        ''' 
        Initializes the object
        
        Input:
            working_directory is where potential DICOM decompression can take place
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
        self.working_directory = ''
        self.is_enhanced_ct = None
        if working_directory is not None:
            self.working_directory = working_directory

            
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
               

            number_of_frames = 0
            if dcm1.get("NumberOfFrames") is not None:
                number_of_frames = int(dcm1["NumberOfFrames"].value)
                
            
            if is_enhanced_ct == False:
                has_ipp = False
                has_iop = False
                            
                axis = 0
                if hasattr(dcm1, 'ImageOrientationPatient'):
                    iop = getattr(dcm1, 'ImageOrientationPatient')
                    iop1 = np.array(iop[0:3])
                    iop2 = np.array(iop[3:6])
                    iop3 = np.cross(iop1, iop2)
    
                    axis = np.argmax(abs(iop3))
                    has_iop = True
    
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
                list1 = self.find_tag_recursive(dcm1, 'ImageOrientationPatient')
                if len(list1) == number_of_frames:
                    has_iop = True
                
                list1 = self.find_tag_recursive(dcm1, 'Columns')
                if len(list1) > 0:
                    image_nx = int(list1[0].value)
                
                list1 = self.find_tag_recursive(dcm1, 'Rows')
                if len(list1) > 0:
                    image_ny = int(list1[0].value)
                
                list1 = self.find_tag_recursive(dcm1, 'TablePosition')
                if len(list1) == number_of_frames:
                    table_position_list = [j.value for j in list1]
                
                # CTImageStorageClass 1.2.840.10008.5.1.4.1.1.2
                # EnhancedCTImageStorageClass   1.2.840.10008.5.1.4.1.1.2.1

                        
                if hasattr(dcm1, 'ImageType'):            
                    image_type_str = str(getattr(dcm1, 'ImageType'))                
                    match1 = re.search("LOCALIZER|SCOUT", image_type_str)
                    if match1:
                        #ignore such volume
                        continue
                
                if hasattr(dcm1, 'SeriesInstanceUID'):            
                    series_instance_uid = str(getattr(dcm1, 'SeriesInstanceUID'))                
                                
                if not has_ipp:
                    print('File %s does not have a valid ImagePositionPatient tag, ignoring.' % (dicom_file), file=sys.stderr)
                if not has_iop:
                    print('File %s does not have a valid ImageOrientationPatient tag, ignoring.' % (dicom_file), file=sys.stderr)
                
                
                if has_iop \
                    and has_ipp:
                    
                    slice_position_list.append((pos,i, series_instance_uid, 
                                                dicom_file, ts, is_enhanced_ct, number_of_frames))
                    instance_nr_list.append((inst_nr, i, image_nx, image_ny))
                    break
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
        
        # check for duplicates and missing images
        has_duplicate_position = False
        has_multiple_series_uids = False
        
        first_series_uid = slice_position_list[0][2]
        
        for i in range(1, len(slice_position_list)):
            if slice_position_list[i][0] ==  slice_position_list[i-1][0]:
                has_duplicate_position = True
                idx1 = slice_position_list[i][1]
                idx2 = slice_position_list[i-1][1]
                print('File %s has the same slice position as file %s.' % (dicom_files[idx1],
                                                                           dicom_files[idx2]),
                      file=sys.stderr)
        
            if slice_position_list[i][2] != first_series_uid:
                has_multiple_series_uids = True
                idx1 = slice_position_list[i][1]
                idx2 = slice_position_list[0][1]
                print('File %s has a different SeriesInstanceUID than the file %s.' % (dicom_files[idx1],
                                                                                       dicom_files[idx2]),
                      file=sys.stderr)
        
        if has_duplicate_position:
            print("Input DICOM files with duplicate slice positions, invalid data", file=sys.stderr)
            return INPUT_DATA_INVALID
        
        if has_multiple_series_uids:
            print("Input DICOM files don't have a single common SeriesInstanceUID value, invalid data", file=sys.stderr)
            return INPUT_DATA_INVALID
        
        has_duplicate_instance_nr = False
        has_inconsistent_instance_nr_list = False
        has_inconsistent_image_size = False
        
        for i in range(1, len(instance_nr_list)):
            if instance_nr_list[i][0] == instance_nr_list[i-1][0]:
                has_duplicate_instance_nr = True
                idx1 = slice_position_list[i][1]
                idx2 = slice_position_list[i-1][1]
                print('File %s has the same InstanceNumber = %d as the file %s.' % \
                      (dicom_files[idx1], instance_nr_list[i][0], dicom_files[idx2]), \
                      file=sys.stderr)
                
            inst_nr_diff = int(round(np.abs(instance_nr_list[i][0] - instance_nr_list[i-1][0]))) 
            if inst_nr_diff != 1:
                has_inconsistent_instance_nr_list = True
                idx1 = slice_position_list[i][1]
                idx2 = slice_position_list[i-1][1]
                print('File %s has InstanceNumber = %d whereas the previous file %s has InstanceNumber = %d (difference of %d).' % 
                      (dicom_files[idx1], instance_nr_list[i][0], dicom_files[idx2], instance_nr_list[i-1][0], inst_nr_diff),
                      file=sys.stderr)
            
            if (instance_nr_list[i][2] != instance_nr_list[0][2]) or \
                (instance_nr_list[i][3] != instance_nr_list[0][3]):
                    
                has_inconsistent_image_size = True
                idx1 = slice_position_list[i][1]
                idx2 = slice_position_list[0][1]
                print('File %s has dimensions (%d, %d) whereas the first file in series %s has dimensions (%d, %d).' % 
                      (dicom_files[idx1], instance_nr_list[i][2], instance_nr_list[i][3],
                       dicom_files[idx2], instance_nr_list[0][2], instance_nr_list[0][3]),
                       file=sys.stderr)
                    

        if has_duplicate_instance_nr:
            print("Input DICOM files with duplicate instance numbers, invalid data", file=sys.stderr)
            return INPUT_DATA_INVALID
        
        if has_inconsistent_instance_nr_list:
            print("Input DICOM files with inconsistent instance numbers sequence, invalid data (probably some images missing?)",
                  file=sys.stderr)
            return INPUT_DATA_INVALID
        
        if has_inconsistent_image_size:
            print("Input DICOM files with inconsistent sizes, invalid data",
                  file=sys.stderr)
            return INPUT_DATA_INVALID

        
        # now, read in the volume
        # also, initialize origin, orientation and spacing

        self.dimensions = []
        self.volume = None
        self.voxel_spacing = None
        self.volume_origin = None
        self.volume_direction = None
        volume_np = None
        prev_slice_position= None
        self.interslice_distance_list = []
        self.slice_thickness_list = []        
        n_slices = len(slice_position_list)
        dicom_files2 = []
        
        for j, t in enumerate(slice_position_list):
            pos = t[0]
            i = t[1]
            dicom_file = t[3]
            ts = t[4]
            is_enhanced_ct = t[5]
            number_of_frames = t[6]
                                
            dicom_files2.append(dicom_file)
            
            if self.verbose_level >= 4:
                print("Reading file %s" % (dicom_file))
                
            #if ts.is_compressed:
                # we rely on the fact that pydicom can decompress
                
            try:
                dcm1 = pydicom.read_file(dicom_file, stop_before_pixels=False)
            except IOError as e:
                print("File read error ({0}): {1}, {2}".format(e.errno, e.strerror, dicom_file),
                      file=sys.stderr)
                return INPUT_DATA_NOT_READABLE
            except: #handle other exceptions 
                print("Unexpected error: {0}, {1}".format(sys.exc_info()[0], dicom_file),
                      file=sys.stderr)
                return INPUT_DATA_NOT_READABLE
                
            ts = dcm1.file_meta.TransferSyntaxUID
            if ts.is_compressed == True:
                dcm1.decompress(handler_name='pylibjpeg')
                
            
            # use information of the first slice to initialize
            # target volume, size, origin, orientation, spacing
            if volume_np is None:
                if is_enhanced_ct == False:
                    self.dimensions = [dcm1.pixel_array.shape[1],
                                       dcm1.pixel_array.shape[0],
                                       n_slices]
                else:
                    self.dimensions = [dcm1.pixel_array.shape[2],
                                       dcm1.pixel_array.shape[1],
                                       dcm1.pixel_array.shape[0]]
                

                volume_np = np.zeros(self.dimensions[::-1], dtype=np.float32)

                spacing = [1.0, 1.0, 1.0]
                if number_of_frames == 0:
                    if hasattr(dcm1, 'PixelSpacing'):
                        spA = getattr(dcm1, 'PixelSpacing')
                        if len(spA) == 2:
                            spA = list(map(float, spA))
                            spacing[0:2] = spA[0:2]
                    self.volume_spacing = spacing
                else:
                    list1 = self.find_tag_recursive(dcm1, 'PixelSpacing')
                    if len(list1) > 0:
                        spA = list1[0].value
                        if len(spA) == 2:
                            spA = list(map(float, spA))
                            spacing[0:2] = spA[0:2]
                        self.volume_spacing = spacing

                self.ipp_list_np = np.zeros((self.dimensions[2], 3))
                self.iop_list_np = np.zeros((self.dimensions[2], 3, 3))


            # CTImageStorage class has the necessary tags
            # stored per slice.
            if is_enhanced_ct == False:
                slice_thicknessA = 0.0
                slice_thickness_valid =  False
                if hasattr(dcm1, 'SliceThickness'):
                    slice_thicknessA = float(getattr(dcm1, 'SliceThickness'))
                    slice_thickness_valid = True
    
    
                if slice_thickness_valid:
                    self.slice_thickness_list.append(slice_thicknessA)
                else:
                    self.slice_thickness_list.append(None)
    
                ipp = [0, 0, 0]
                ipp_valid = False
                if hasattr(dcm1, 'ImagePositionPatient'):
                    ippA = getattr(dcm1, 'ImagePositionPatient')
                    if len(ippA) == 3:
                        ippA = list(map(float, ippA))
                        ipp = ippA
                        ipp_valid = True
                if j == 0:
                    self.volume_origin = ipp
    
                ipp_np = np.array(ipp)
    
                iop = [1, 0, 0, 0, 1, 0]
                iop_valid = False
                if hasattr(dcm1, 'ImageOrientationPatient'):
                    iopA = getattr(dcm1, 'ImageOrientationPatient')
                    if len(iopA) == 6:
                        iopA = list(map(float, iopA))
                        iop = iopA
                        iop_valid = True
    
                iop1 = np.array(iop[0:3])
                iop2 = np.array(iop[3:6])
                iop3 = np.cross(iop1, iop2)
    
                if self.volume_direction is None:
                    self.volume_direction = np.zeros((3,3), dtype=float)
                    self.volume_direction[:,0] = iop1
                    self.volume_direction[:,1] = iop2
                    self.volume_direction[:,2] = iop3
                    
                if self.apply_rescale:
                    intercept = getattr(dcm1, 'RescaleIntercept', 0)
                    slope = getattr(dcm1, 'RescaleSlope', 1)
                    if intercept == 0.0 and slope == 1.0:
                        volume_np[j, :, :] = dcm1.pixel_array.astype(np.float32)
                    else:
                        image_np2 = dcm1.pixel_array.astype(np.float32)
                        image_np2[:] = image_np2[:] * slope
                        image_np2[:] = image_np2[:] + intercept
    
                        volume_np[j, :, :] = image_np2[:,:]
                else:
                    volume_np[j, :, :] = dcm1.pixel_array.astype(np.float32)
                    
                self.ipp_list_np[j, :] = ipp_np
                self.iop_list_np[j, 0, :] = iop1
                self.iop_list_np[j, 1, :] = iop2
                self.iop_list_np[j, 2, :] = iop3

            elif (is_enhanced_ct == True) and (number_of_frames > 0):
                
                # EnhancedCTImageStorage class has the necessary tags
                # stored in sequences in the single DICOM file.
                
                list1 = self.find_tag_recursive(dcm1, 'SliceThickness')
                if len(list1) == number_of_frames:
                    slice_thickness_valid = True
                    self.slice_thickness_list = [i.value for i in list1]
                elif len(list1) > 0:
                    slice_thickness_valid = True
                    self.slice_thickness_list = [float(list1[0].value)] * number_of_frames
                
                ipp_valid = False
                list1 = self.find_tag_recursive(dcm1, 'ImagePositionPatient')
                if len(list1) == number_of_frames:
                    ipp_valid = True
                    for i in range(number_of_frames):
                        ipp = list(list1[i].value)
                        self.ipp_list_np[i,:] = ipp
                    
                    self.volume_origin = self.ipp_list_np[0,:]
                        
                iop_valid = False
                list1 = self.find_tag_recursive(dcm1, 'ImageOrientationPatient')
                if len(list1) == number_of_frames:
                    iop_valid = True
                    for i in range(number_of_frames):
                        iop = list(list1[i].value)
                        
                        iop1 = np.array(iop[0:3])
                        iop2 = np.array(iop[3:6])
                        iop3 = np.cross(iop1, iop2)
                        
                        self.iop_list_np[i,0, :] = iop1
                        self.iop_list_np[i,1, :] = iop2
                        self.iop_list_np[i,2, :] = iop3
                                            
                    self.volume_direction = np.zeros((3,3), dtype=float)
                    self.volume_direction[:,0] = self.iop_list_np[0,0, :]
                    self.volume_direction[:,1] = self.iop_list_np[0,1, :]
                    self.volume_direction[:,2] = self.iop_list_np[0,2, :]
                

                if self.apply_rescale:
                    intercept = 0.0
                    list1 = self.find_tag_recursive(dcm1, 'RescaleIntercept')
                    if len(list1) > 0:
                        intercept = float(list1[0].value)
                    
                    slope = 1.0
                    list1 = self.find_tag_recursive(dcm1, 'RescaleSlope')
                    if len(list1) > 0:
                        slope = float(list1[0].value)
                        
                    if intercept == 0.0 and slope == 1.0:
                        volume_np[:, :, :] = dcm1.pixel_array.astype(np.float32)
                    else:
                        image_np2 = dcm1.pixel_array.astype(np.float32)
                        volume_np = volume_np * slope
                        volume_np = volume_np + intercept                            
                else:
                    volume_np = dcm1.pixel_array.astype(np.float32)

            else:
                print("Invalid DICOM file", file=sys.stderr)
                raise

            del dcm1.PixelData
            
            if self.header1 is None:
                self.header1 = dcm1
                

            if is_enhanced_ct == False:
                if iop_valid and ipp_valid:
                    if prev_slice_position is not None:
                        ipp_dif = ipp_np - prev_slice_position
                        inter_slice_dist = np.abs(np.dot(ipp_dif, iop3))
                        self.interslice_distance_list.append(inter_slice_dist)
    
                    prev_slice_position = ipp_np
                else:
                    self.interslice_distance_list.append(None)
                    prev_slice_position = None
            else: # is_enhanced_ct = True
                if iop_valid and ipp_valid:
                    
                    for slice_no in range(1, self.dimensions[2]):
                        ipp_dif = self.ipp_list_np[slice_no, :] - self.ipp_list_np[slice_no-1, :]
                        iop3 = self.iop_list_np[slice_no, 2, :]
                        inter_slice_dist = np.abs(np.dot(ipp_dif, iop3))
                        self.interslice_distance_list.append(inter_slice_dist)
                break


        self.volume_is_rai = False

        if len(table_position_list) > 1:
            if(table_position_list[0] > table_position_list[-1]):
                
                if self.verbose_level >= 3:
                    print("Transforming data upside-down along the Z direction, because it was acquired in RAI coordinate space...")
                
                self.volume_is_rai = True
                volume_np = np.flip(volume_np, 0)
                self.interslice_distance_list.reverse()
                self.slice_thickness_list.reverse()
                table_position_list.reverse()
                self.ipp_list_np = np.flip(self.ipp_list_np, 0)
                self.iop_list_np = np.flip(self.iop_list_np, 0)          



        # after reading all DICOM files, adjust slice thickness information
        if (len(self.interslice_distance_list) > 0) and (self.interslice_distance_list[0] is not None):
            self.volume_spacing[2] = self.interslice_distance_list[0]
        elif (len(self.slice_thickness_list) > 0) and (self.slice_thickness_list[0] is not None):
                self.volume_spacing[2] = self.slice_thickness_list[0]

        self.dicom_files = dicom_files2
        
        # ignore "out-of-volume" DICOM values, if present
        volume_np[volume_np < -1023] = -1024
        
        self.volume = sitk.GetImageFromArray(volume_np)
        self.volume.SetSpacing(self.volume_spacing)
        self.volume.SetOrigin(self.volume_origin)
        self.volume.SetDirection(self.volume_direction.reshape(9).tolist())
        
        del volume_np
        
        size1 = self.volume.GetSize()
        spacing1 = self.volume.GetSpacing()
        
        if self.verbose_level >= 2:
            print("RPDPyDcm: volume size " + str(size1[0]) + " x " + str(size1[1]) +
                  " x " + str(size1[2]))
            
            print("RPDPyDcm: volume spacing "+"{0:0.3}".format(spacing1[0]) + " x " +
                                          "{0:0.3}".format(spacing1[1]) + " x "+
                                          "{0:0.3}".format(spacing1[2]) +
                                          " mm")

        if self.verbose_level >= 4:
            print("RPDPyDcm: Slice Thickness: ")
            ll = ["\tSlice {}: {:.3f}".format(*e) for e in enumerate(self.slice_thickness_list)]
            print('\n'.join(ll))
                    
            
            print("RPDPyDcm: Inter-slice distance: ")
            ll = ["\tSlice {}: {:.3f}".format(*e) for e in enumerate(self.interslice_distance_list)]
            print('\n'.join(ll))
        
        
        self.is_enhanced_ct = is_enhanced_ct
        self.interslice_distance_list_orig = self.interslice_distance_list
        self.slice_thickness_list_orig = self.slice_thickness_list
        self.iop_list_np_orig = self.iop_list_np
        self.ipp_list_np_orig = self.ipp_list_np

        return NO_ERROR


                

    def correctForGantryTilt(self, just_check_if_needed) -> bool:
        
        ''' Corrects slice shift induced by gantry tilt.
            
            Modifies the self.volume volume based on IPP and IOP DICOM header information.
            Slices are shifted so that their origins align (axially).
            
            The middle slice is used as reference that is not moving.
        '''
        

        if self.verbose_level >= 3:
            print("RPDPyDcm: checking for potential gantry-tilt induced slice offset ...")        

        n = len(self.ipp_list_np)
        n2 = int(np.round(n / 2))

        reference_ipp = self.ipp_list_np[n2,:]

        pix_x_dd = self.volume_spacing[0] / 4.0
        pix_y_dd = self.volume_spacing[1] / 4.0

        nx = self.dimensions[0]
        ny = self.dimensions[1]
        nz = self.dimensions[2]

        minmaxfilt = sitk.MinimumMaximumImageFilter()
        minmaxfilt.Execute(self.volume)
        minvalue = minmaxfilt.GetMinimum()

        self.gantry_tilt_correction_needed = False
        
        volume_dx = 0.0
        volume_dy = 0.0
        
        max_dx = 0.0
        max_dy = 0.0

        for z in range(nz):
            ipp = self.ipp_list_np[z,:]
            iop_x = self.iop_list_np[z, 0, :]
            iop_y = self.iop_list_np[z, 1, :]

            ipp_dif = ipp - reference_ipp

            # Determine slice shift by checking how much the slice 
            # origin is shifted in the inplane X and Y direction

            shift_x = np.dot(iop_x, ipp_dif)
            shift_y = np.dot(iop_y, ipp_dif)
            
            if z == 0:
                volume_dx = shift_x
                volume_dy = shift_y
                
            if np.abs(shift_x) > np.abs(max_dx):
                max_dx = shift_x
            if np.abs(shift_y) > np.abs(max_dy):
                max_dy = shift_y    


            # if the determined shift is substantial, shift and resample the slice
            
            if (np.abs(shift_x) > pix_x_dd) or (np.abs(shift_y) > pix_y_dd):

                self.gantry_tilt_correction_needed = True
                
                if not just_check_if_needed: 
                    if self.verbose_level >= 3:
                        print("\tShifting slice %d contents: dx = %.3f mm, dy = %.3f mm" % (z, shift_x, shift_y))
    
                    extractor = sitk.ExtractImageFilter()
                    extractor.SetSize((nx, ny, 0))
                    extractor.SetIndex((0,0,z))
                    slice1 = extractor.Execute(self.volume)
    
                    dimension = 2
                    translation = sitk.TranslationTransform(dimension)
                    translation.SetParameters((-shift_x, -shift_y))
                    interpolator = sitk.sitkLinear
                    default_value = minvalue
                    shifted_slice1 = sitk.Resample(slice1, slice1, translation, interpolator,
                                                   default_value)
    
                    #tmpimg = sitk.JoinSeries(shifted_slice1)
                    #paster = sitk.PasteImageFilter()
                    #paster.SetDestinationIndex((0,0,z))
                    #paster.SetSourceIndex((0,0,0))
                    #paster.SetSourceSize(tmpimg.GetSize())
                    #self.volume = paster.Execute(self.volume, tmpimg)
                    self.volume[:,:,z] = shifted_slice1
                    
                    ipp = ipp + iop_x * shift_x
                    ipp = ipp + iop_y * shift_y
                    self.ipp_list_np[z,:] = ipp
        
        if not just_check_if_needed:
            origin1 = self.volume.GetOrigin()
            origin1a = np.array(origin1)
            
            origin1a = origin1a + self.iop_list_np[0,0,:] * volume_dx
            origin1a = origin1a + self.iop_list_np[0,1,:] * volume_dy
            origin1 = (origin1a[0], origin1a[1], origin1a[2])
            self.volume.SetOrigin(origin1)
        
        return self.gantry_tilt_correction_needed


    def _analyze_if_half_and_full_thickness_slice(self, tolerance = 0.1):
        
        ''' Analyzes if the input volume / slice stack contains
            x and x/2 slice thicknesses
            
            Tolerance defines acceptable variability to be considered belonging 
            to the same slice thickness group (in millimeters)
            
            input: self.thickness_list
            
            output:
                Value 0: only one thickness value = just single slice thickness
                Value 1: two slice thicknesses (x and x/2)
                Value 2: (not used)
                Value 3: slice thicknesses not grouped into two separate groups 
                         (1st and 2nd group), can't work with mixed list
                Value 4: more than 2 slice thickness values in list
                Value 5: at least one slice thickness is < 0.1, can't continue
                Value 6: two slice thickness groups, but not in x  and x/2 relation
        '''
        
        thickness_count = dict()
        thickness_minIdx = dict()
        thickness_maxIdx = dict()
        thickness_loc = dict()
        thickness_list = []


        # analyze slice thicknesses by putting them into a dict
        # based on their slice thickness, to create slice thickness groups
        # also, note where the slice thickness starts and ends in the 
        # slice list (this list is sorted by slice location) 
        for i, d in enumerate(self.slice_thickness_list):
            inserted = False
            for v in thickness_count:
                if np.abs(d-v) < tolerance:
                    thickness_count[v] = thickness_count[v] + 1
                    if i < thickness_minIdx[v]:
                        thickness_minIdx[v] = i
                    if i > thickness_maxIdx[v]:
                        thickness_maxIdx[v] = i
                    thickness_loc[v].append(i)
                    inserted = True
                    break

            if not inserted:
                thickness_count[d] = 1
                thickness_minIdx[d] = i
                thickness_maxIdx[d] = i
                thickness_loc[d] = [i]
                thickness_list.append(d)


        # Analyze how many slice thickness groups we have

        n = len(thickness_count.keys())
        if n == 1:
            # only one slice thickness group
            return 0, thickness_loc


        keys1 = thickness_count.keys()
        consecutive = True

        # this checks if the slice thickness are in separate groups, are whether
        # they are mixed
        j = 0
        for key_j in keys1:
            i = 0
            for key_i in keys1:
                if i != j:
                    if (thickness_minIdx[key_i] >= thickness_minIdx[key_j]) and (thickness_minIdx[key_i] <= thickness_maxIdx[key_j]):
                        consecutive = False
                        break
                    if (thickness_maxIdx[key_i] >= thickness_minIdx[key_j]) and (thickness_maxIdx[key_i] <= thickness_maxIdx[key_j]):
                        consecutive = False
                        break
                i = i+1

            if not consecutive:
                break
            
            j = j+1
            
        if not consecutive:
            # if not consecutive separate groups, can't continue
            return 3, thickness_loc
        
        if n > 2:
            # more than 2 slice thickness groups
            return 4, thickness_loc
        
        thickness_list_sorted = sorted(thickness_list)
        
        if thickness_list_sorted[0] < 0.1:
            # at least one slice thickness is below < 0.1, can't continue
            return 5, thickness_loc
        
        if np.abs((thickness_list_sorted[1] / thickness_list_sorted[0]) - 2.0) > 0.1:
            # slice thickness groups are not in x and x/2 relationship
            return 6, thickness_loc
        
        # all other combination were tested and excluded, so 
        # we must have two groups with x and x/2 relationship
        return 1, thickness_loc
        
        
    def merge_half_and_full_thickness_slices(self, tolerance = 0.1):
        
        '''
        Merges slices with x/2 and x slice thickness into x-slice target thickness
        If there are odd-count x/2 slices, the one slice is transformed into an x-slice thickness slice.
        
        Resamples also the slice_thickness, IPP and IOP lists.
        
        Input:
            self.volume
            slice thickess, inter-slice distance, IPP and IOP lists
            

        Output:
            self.volume
            slice thickess, inter-slice distance, IPP and IOP lists
        '''
        
        # first, analyze if and what we can merge
        code, thickness_loc2 = self._analyze_if_half_and_full_thickness_slice(tolerance)
        
        if code != 1:
            # if not two slice groups with x and x/2 slice thickness relationship
            if code == 0:
                # only one slice thickness was detected, nothing to merge
                pass
            
            if code == 3:
                if self.verbose_level >= 1:
                    print("RPDPyDcm: Slice thickeness merge correction not executed, different slice thicknesses not consecutive in groups")
             
            if code == 4:
                if self.verbose_level >= 1:
                    print("RPDPyDcm: Slice thickeness merge correction not executed, more than two slice thicknesses detected")

            if code == 5:
                if self.verbose_level >= 1:
                    print("RPDPyDcm: Slice thickeness merge correction not executed, slice thickness < 0.1mm detected")
            
            if code == 6:
                if self.verbose_level >= 1:
                    print("RPDPyDcm: Slice thickeness merge correction not executed, slice thicknesses not in ratio 1:2")
            
            return code, thickness_loc2
        

        # two slice thicknesses were detected,
        # in ratio x and x/2
        # the merging of slices will happen
        # depending on which group has the thinner and which group
        # has the thicker slices
    
        thickness_list1 = [a for a in thickness_loc2.keys()]
        
        thickness_list1_sorted = sorted(thickness_list1)
        
        group_to_merge = thickness_loc2[thickness_list1_sorted[0]]
        group_to_merge = sorted(group_to_merge)

        group_to_keep = thickness_loc2[thickness_list1_sorted[1]]           
        group_to_keep = sorted(group_to_keep)
        
        print("RPDPyDcm: Dual-slice thickness merging")
        
        print("\t" + str(len(group_to_merge)) +  
              " slices (" + str(group_to_merge[0]) + " - " + str(group_to_merge[-1]) + 
              ") will be merged, with slice thickness " +
              str(self.slice_thickness_list[group_to_merge[0]]))
        print("\t" + str(len(group_to_keep)) +
              " slices ("+str(group_to_keep[0]) + " - " + str(group_to_keep[-1]) +
              ") will be kept as they are, with slice thickness " +
              str(self.slice_thickness_list[group_to_keep[0]]))
        
        nx = self.volume.GetSize()[0]
        ny = self.volume.GetSize()[1]

        # we need to extract the two sub-volumes, to allow merging
        # of slices in the thinner-slice subvolume
        
        extractor1 = sitk.RegionOfInterestImageFilter()
        extractor1.SetSize((nx, ny, group_to_merge[-1]-group_to_merge[0]+1))
        extractor1.SetIndex((0,0,group_to_merge[0]))
        halfSliceVol = extractor1.Execute(self.volume)
        spacing1 = halfSliceVol.GetSpacing()
        spacing1 = (spacing1[0], spacing1[1], thickness_list1_sorted[0])
        halfSliceVol.SetSpacing(spacing1)
        
        extractor2 = sitk.RegionOfInterestImageFilter()
        extractor2.SetSize((nx, ny, group_to_keep[-1]-group_to_keep[0]+1))
        extractor2.SetIndex((0,0,group_to_keep[0]))
        fullSliceVol = extractor2.Execute(self.volume)
        spacing2 = fullSliceVol.GetSpacing()
        spacing2 = (spacing2[0], spacing2[1], thickness_list1_sorted[1])
        fullSliceVol.SetSpacing(spacing2)

        # determine what will be the final slice spacing value
        target_pz = spacing2[2]
        idx1 = int((group_to_keep[0] + group_to_keep[-1]) / 2) # center slice between first and last
        if self.interslice_distance_list[idx1] is not None:
            target_pz = self.interslice_distance_list[idx1]

        # we will merge the thin slices into thick slices by averaging
        halfSliceVol_np = sitk.GetArrayFromImage(halfSliceVol)
  
        shape2 = halfSliceVol_np.shape
        shape2 = (int(np.ceil(shape2[0] / 2.0)), shape2[1], shape2[2])
        halfSliceVolMerged_np = np.zeros(shape2, halfSliceVol_np.dtype)      
  
        nzHalfSlice = halfSliceVol_np.shape[0] # this is number of slices in numpy notation
        nzHalfSliceA = int(np.floor(nzHalfSlice / 2.0))
        
        z = 0
        for zi in range(nzHalfSliceA):
            slice1 = halfSliceVol_np[z,:,:]
            slice1 = slice1.astype(np.float32)
            slice2 = halfSliceVol_np[z+1,:,:]
            if self.is_mask:
                slice1 = np.maximum(slice1, slice2)
            else:
                slice2 = slice2.astype(np.float32)
                slice1 = (slice1 + slice2) / 2.0
                slice1 = np.round(slice1)
                slice1 = slice1.astype(halfSliceVol_np.dtype)
                
            halfSliceVolMerged_np[zi,:,:] = slice1
            z = z + 2
        
        zi = zi + 1
        
        # here we handle the last remaining thin slice, if the count was odd.
        if zi < shape2[0]:
            halfSliceVolMerged_np[zi,:,:] = halfSliceVol[halfSliceVol_np.shape[0]-1,:,:]
            zi = zi + 1

        # we convert the merged slices into SimpleITK volume
        halfSliceVolMerged = sitk.GetImageFromArray(halfSliceVolMerged_np)
        halfSliceVolMerged.SetOrigin(halfSliceVol.GetOrigin())
        halfSliceVolMerged.SetDirection(halfSliceVol.GetDirection())
        halfSliceVolMerged.SetSpacing(spacing2)

        new_nz = fullSliceVol.GetSize()[2]+halfSliceVolMerged.GetSize()[2]

        newVolShape = [nx, ny, new_nz]

        newVol = sitk.Image(newVolShape, self.volume.GetPixelID())

        # this dict represents which slices have specified (=dict key) slice thickness
        # of course, after merging, all of the slices will have the target thickness
        thickness_loc3 = dict()
        thickness_loc3[target_pz] = [i for i in range(new_nz)]


        # here we merge the two slice groups so that the bottom group was
        # the one with originally thin slices and the top group was originally
        # the thick (target) slice group
        if group_to_merge[0] < group_to_keep[0]:
            #paster1 = sitk.PasteImageFilter()
            #paster1.SetDestinationIndex((0,0,0))
            #paster1.SetSourceIndex((0,0,0))
            #paster1.SetSourceSize(halfSliceVolMerged.GetSize())
            #newVol = paster1.Execute(newVol, halfSliceVolMerged)
            nzz = halfSliceVolMerged.GetSize()[2]
            newVol[:,:,0:nzz] = halfSliceVolMerged
            
            #paster1.SetDestinationIndex((0,0,halfSliceVolMerged.GetSize()[2]))
            #paster1.SetSourceIndex((0,0,0))
            #paster1.SetSourceSize(fullSliceVol.GetSize())
            #newVol = paster1.Execute(newVol, fullSliceVol)
            nzz2 = fullSliceVol.GetSize()[2]
            newVol[:,:,nzz:nzz+nzz2] = fullSliceVol
            

            newVol.SetOrigin(halfSliceVol.GetOrigin())
            newVol.SetDirection(halfSliceVol.GetDirection())
            spacing3 = halfSliceVol.GetSpacing()
            spacing3 = (spacing3[0], spacing3[1], target_pz)
            newVol.SetSpacing(spacing3)
            
            self.volume = newVol                
            self.slice_thickness_list = [target_pz] * new_nz
            self.interslice_distance_list = [target_pz] * (new_nz-1)
                            
            new_ipp_list_np = np.zeros((new_nz, 3), dtype = np.float32)
            new_iop_list_np = np.zeros((new_nz, 3, 3), dtype = np.float32)
            
            nz2 = int(np.floor(len(group_to_merge) / 2.0))            
            z = 0
            for zi in range(nz2):
                ipp1 = self.ipp_list_np[z,:]
                ipp2 = self.ipp_list_np[z+1,:]
                ipp3 = (ipp1 + ipp2) / 2.0
                new_ipp_list_np[zi, :] = ipp3                
                new_iop_list_np[zi, :, :] = self.iop_list_np[z, :, :]                
                z = z + 2
            
            zi = zi + 1;
            
            if zi < shape2[0]:
                new_ipp_list_np[zi, :] = self.ipp_list_np[group_to_merge[-1],:]
                new_iop_list_np[zi, :, :] = self.iop_list_np[group_to_merge[-1], :, :]
                zi = zi + 1

            for zi2 in group_to_keep:
                ipp = self.ipp_list_np[zi2,:]
                new_ipp_list_np[zi,:] = ipp
                new_iop_list_np[zi, :, :] = self.iop_list_np[zi2, :, :]
                zi = zi + 1
                
            self.ipp_list_np = new_ipp_list_np
            self.iop_list_np = new_iop_list_np
        else:
            # here we merge the two slice groups so that the top group was
            # the one with originally thick slices (target slice thickness)
            # and the top group was originally with the thin slices
            
            
            #paster1 = sitk.PasteImageFilter()
            
            #paster1.SetDestinationIndex((0,0,0))
            #paster1.SetSourceIndex((0,0,0))
            #paster1.SetSourceSize(fullSliceVol.GetSize())
            #newVol = paster1.Execute(newVol, fullSliceVol)            
            nzz = fullSliceVol.GetSize()[2]
            newVol[:,:,0:nzz] = fullSliceVol
            
            
            #paster1.SetDestinationIndex((0,0,fullSliceVol.GetSize()[2]))
            #paster1.SetSourceIndex((0,0,0))
            #paster1.SetSourceSize(halfSliceVolMerged.GetSize())
            #newVol = paster1.Execute(newVol, halfSliceVolMerged)
            nzz2 = halfSliceVolMerged.GetSize()[2]
            newVol[:,:,nzz:nzz+nzz2] = halfSliceVolMerged

            newVol.SetOrigin(fullSliceVol.GetOrigin())
            newVol.SetDirection(fullSliceVol.GetDirection())
            spacing3 = fullSliceVol.GetSpacing()
            spacing3 = (spacing3[0], spacing3[1], target_pz)
            newVol.SetSpacing(spacing3)
            
            self.volume = newVol
            self.slice_thickness_list = [target_pz] * new_nz
            self.interslice_distance_list = [target_pz] * (new_nz-1)
                           
            new_ipp_list_np = np.zeros((new_nz, 3), dtype = np.float32)
            new_iop_list_np = np.zeros((new_nz, 3, 3), dtype = np.float32)
            
            nz2 = int(np.floor(len(group_to_merge) / 2.0))       
            
            zi = 0
            for zi2 in group_to_keep:
                ipp = self.ipp_list_np[zi2,:]
                new_ipp_list_np[zi,:] = ipp
                new_iop_list_np[zi, :, :] = self.iop_list_np[zi2, :, :]
                zi = zi + 1
            
            z = group_to_merge[0]
            for zi3 in range(nz2):
                ipp1 = self.ipp_list_np[z,:]
                ipp2 = self.ipp_list_np[z+1,:]
                ipp3 = (ipp1 + ipp2) / 2.0
                new_ipp_list_np[zi, :] = ipp3                
                new_iop_list_np[zi, :, :] = self.iop_list_np[z, :, :]                
                z = z + 2
                zi = zi + 1
                            
            if zi < shape2[0]:
                new_ipp_list_np[zi, :] = self.ipp_list_np[group_to_merge[-1],:]
                new_iop_list_np[zi, :, :] = self.iop_list_np[group_to_merge[-1], :, :]
                zi = zi + 1
                
            self.ipp_list_np = new_ipp_list_np
            self.iop_list_np = new_iop_list_np
            
        size1 = self.volume.GetSize()
        spacing1 = self.volume.GetSpacing()
        
        print("RPDPyDcm: dual slice thickness corrected")
        print("RPDPyDcm: new volume size " + str(size1[0]) + " x " + str(size1[1]) +
              " x " + str(size1[2]))
        print("RPDPyDcm: new volume spacing "+"{0:0.3}".format(spacing1[0]) + " x " +
                                              "{0:0.3}".format(spacing1[1]) + " x " +
                                              "{0:0.3}".format(spacing1[2]) + " mm")

        if self.verbose_level >= 4:
            print("RPDPyDcm: Slice thicknesses: ")    
            ll = ["\tSlice {}: {:.3f}".format(*e) for e in enumerate(self.slice_thickness_list)]
            print('\n'.join(ll))
        
        return 1, thickness_loc3

        
    def merge_slices(self, merge_factor: int) -> bool:
        
        '''
        Merges slices into thicker slices by a defined factor by averaging.
        Incomplete last group is merged only to its extent (averaging only
        defined number of slices; this might lead to worse noise situation).
        
        E.g., with factor 3 it merges always 3 2.0mm slices into 1 6.0mm slices.
        
        A prerequisite for accurate output is that there is no gantry-tilt-induced
        slice shift, of that the gantry-tilt-induced slice shift was corrected.
        
        Input:
            self.volume
            IOP, IPP, SliceThickness list, inter-slice distance list
        
        Output:
            self.volume
            IOP, IPP, SliceThickness list, inter-slice distance list

        
        '''
        if merge_factor <= 1:
            return False
            
        current_size = self.volume.GetSize()
        new_size = (current_size[0], 
                    current_size[1],  
                    int(np.ceil(float(current_size[2]) / float(merge_factor))))
    
        new_nz = new_size[2]
        new_size_np = new_size[::-1]
        
        current_volume_np = sitk.GetArrayFromImage(self.volume)
        new_volume_np = np.zeros(new_size_np, dtype = current_volume_np.dtype)
    
        current_volume_z = 0
        current_spacing = self.volume.GetSpacing()
        
        new_ipp_list_np = np.zeros((new_nz, 3), dtype = np.float32)
        new_iop_list_np = np.zeros((new_nz, 3, 3), dtype = np.float32)
                    
        # merge the slices by averaging
        # last merge, if incomplete, will be merged from fewer slices
        # also recompute the IPP value (center of the newly merged slice)
        # and IOP values (keed the orientation the same as the first slice in merging,
        # the slices should be parallel anyway)
        for target_z in range(new_size[2]):
            
            slice_count = 1.0
            slices1 = current_volume_np[current_volume_z,:,:].astype(np.double)
            ipp1 = self.ipp_list_np[current_volume_z,:]
            iop1 = self.iop_list_np[current_volume_z, :, :] 
            
            current_volume_z = current_volume_z + 1
           
            for i in range(merge_factor-1):
                
                if current_volume_z >= current_size[2]:
                    break
               
                slices1 = slices1 + current_volume_np[current_volume_z,:,:].astype(np.double)
                ipp1 = ipp1 + self.ipp_list_np[current_volume_z,:]
                current_volume_z = current_volume_z + 1
                slice_count = slice_count + 1.0


            slices1 = slices1 / slice_count
        
            # for integer data, do proper rounding
            if np.issubdtype(new_volume_np.dtype, np.integer):
                new_volume_np[target_z,:,:] = np.round(slices1.astype(new_volume_np.dtype))
            else:
                # float data will be not rounded
                new_volume_np[target_z,:,:] = slices1.astype(new_volume_np.dtype)
        
            new_ipp_list_np[target_z,:] = ipp1 / slice_count
            new_iop_list_np[target_z,:,:] = iop1
     
        
        new_volume = sitk.GetImageFromArray(new_volume_np)
        new_volume.SetOrigin(self.volume.GetOrigin())
        new_volume.SetDirection(self.volume.GetDirection())
    
        
        # compute the new slice thickness
        target_pz = float(current_spacing[2]) * float(merge_factor)
    
        new_spacing = (current_spacing[0],
                       current_spacing[1],
                       target_pz)
        
        new_volume.SetSpacing(new_spacing)
    
        self.volume = new_volume
        self.ipp_list_np = new_ipp_list_np
        self.iop_list_np = new_iop_list_np
        self.slice_thickness_list = [target_pz] * new_nz
        self.interslice_distance_list = [target_pz] * (new_nz-1)
        
        return True


    def is_volume_axial_or_axial_oblique(self) -> bool:
        
        ''' 
        Determines whether the loaded DICOM volume is axial/axial oblique
        or not. This is computed by evaluating the dot product of 
        slice normal vector with the Z-axis unit vector. If the dot
        product (cosine of the angle between these two vectors) is
        below set threshold (cosine of 45 degrees), the volume is not
        considered axial or axial oblique.
        
        Input: member variables of loaded DICOM data (image orientation patient tag of the first slice)
        
        Output: bool
        '''
        
        # if None or empty
        if (self.iop_list_np is None) or \
           (len(self.iop_list_np) == 0):
            print("Volume orientation is not available", file = sys.stderr)
            return False
        
        
        image_normal_vec = self.iop_list_np[0, 2, :]
        z_axis_vec = [0,0,1]
        
        d = np.fabs(np.dot(image_normal_vec, z_axis_vec))
        COSINE_45DEG = 0.7071
        if d > COSINE_45DEG:
            return True
        else:
            return False

def export_dicoms(sitk_volume,
                  dcm_ds,
                  fn_prefix,
                  verboseLevel):
    
    size1 = sitk_volume.GetSize()
                    
    filenames = []
    n_colors = sitk_volume.GetNumberOfComponentsPerPixel()        
  
    
    #rescale_slope = 1.0
    #if(hasattr(dcm_ds, 'RescaleSlope')):
    #    rescale_slope = getattr(dcm_ds, 'RescaleSlope')
               
    #rescale_intercept = 0.0
    #if(hasattr(dcm_ds, 'RescaleIntercept')):
    #    rescale_intercept = getattr(dcm_ds, 'RescaleIntercept')
    
    
    # if not RGB
    if n_colors == 1:
        
        instance_nr = 1
        for slice_no in range(size1[2]):
            
            size2 = [size1[0], size1[1], 1]
            index2 = [0, 0, slice_no]
            
            slice1 = sitk.RegionOfInterest(sitk_volume, size2, index2)
            
            slice1_origin = slice1.GetOrigin()
            slice1_spacing = slice1.GetSpacing()
            slice1_size = slice1.GetSize()
            slice1_direction = slice1.GetDirection()
            
            slice1_np = sitk.GetArrayFromImage(slice1)
            
            #slice1_np = slice1_np - rescale_intercept
            #slice1_np /= rescale_slope
             
            #slice1_np = np.around(slice1_np)
            slice1_np = slice1_np.astype(np.uint16)
            
            dcm_ds.InstanceNumber = instance_nr
            dcm_ds.PixelData = slice1_np.tobytes()
            dcm_ds.SOPInstanceUID = pydicom.uid.generate_uid(prefix=ISCHEMAVIEW_UID_PREFIX+".")
            dcm_ds.PixelSpacing = [slice1_spacing[0], slice1_spacing[1]]
            dcm_ds.ImagePositionPatient = [slice1_origin[0], slice1_origin[1], slice1_origin[2]]
            
            dcm_ds.ImageOrientationPatient = [slice1_direction[0], slice1_direction[3],
                                              slice1_direction[6], slice1_direction[1],
                                              slice1_direction[4], slice1_direction[7]]
            
            dcm_ds.SliceThickness = slice1_spacing[2]
            dcm_ds.SliceLocation = slice1_origin[2]
            dcm_ds.Columns = slice1_size[0]
            dcm_ds.Rows = slice1_size[1]
            
            fn = "%s_slice%04d.dcm" % (fn_prefix, instance_nr)
                            
            # Populate required values for file meta information
            file_meta = pydicom.dataset.FileMetaDataset()
            file_meta.MediaStorageSOPClassUID = dcm_ds.SOPClassUID
            file_meta.MediaStorageSOPInstanceUID = dcm_ds.SOPInstanceUID
            file_meta.TransferSyntaxUID = pydicom.uid.ImplicitVRLittleEndian
    
            ds = pydicom.dataset.FileDataset(fn, dcm_ds,
                         file_meta=file_meta, preamble=b"\0" * 128)
            
            if(verboseLevel >= 3):
                print("Writing %s" % (fn))
            
            try:
                pydicom.dcmwrite(fn, ds, write_like_original=False)
            except IOError as e:
                print("File write error ({0}): {1}, {2}".format(e.errno, e.strerror, fn))
                sys.exit(WRITE_ERROR)
            except: #handle other exceptions such as attribute errors
                print("Unexpected error:", sys.exc_info()[0])
                raise
                
            filenames.append(fn)
            instance_nr = instance_nr + 1
    else:
        print("Don't know how to export RGB DICOMs yet!", file=sys.stderr)
        raise
        
    return filenames




if __name__ == "__main__":
    
    parser = argparse.ArgumentParser(
        prog = "DICOM Resampler",
        description="Reads in DICOM series and resamples the data to a defined number of output slices. (c) 2023 iSchemaView, Inc.")
    
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
        "-od",
        "--output_directory",
        help="If output directory is not specified, value for input directory is used",
    )
    parser.add_argument(
        "-fl",
        "--filelist",
        help="input file list containing references to input DICOM files",
    )
    parser.add_argument(
        "-sn",
        "--series_number",
        help="series number of the output DICOM series",
        type = int,
        action='store'
    )
    parser.add_argument(
        "-sno",
        "--series_number_offset",
        help="series number offset wrt the input DICOM series number (multiplied by multiplier) to constitute the output DICOM series",
        type = int,
        choices=range(0, 99999),
        default = None,
        action='store'
    )
    parser.add_argument(
        "-snm",
        "--series_number_multiplier",
        help="series number multiplier of the input DICOM series number to constitute the output DICOM series (plus offset)",
        type = int,
        choices=range(0, 9999),
        default = None,
        action='store'
    )
    parser.add_argument(
        "-sd",
        "--series_description",
        help="Series Description of the output DICOM series",
        action='store'
    )
    parser.add_argument(
        "-sdp",
        "--series_description_prefix",
        help="Prefix the input DICOM series description to create the output DICOM Series Description",
        action='store'
    )
    parser.add_argument(
        "-sds",
        "--series_description_suffix",
        help="Suffix the input DICOM series description to create the output DICOM Series Description",
        action='store'
    )
    parser.add_argument(
        "-ns",
        "--number_of_slices",
        help="Target number of slices",
        action='store',
        required = True,
        choices=range(1, 32768),
        type = int
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

    # current directory by default
    inputDirName = args.input_directory

    outputDirName = inputDirName
    if args.output_directory:
        outputDirName = args.output_directory
        
    if not os.path.exists(outputDirName):
        os.makedirs(outputDirName)
    
    if args.filelist is None:
        
        if args.verbose >= 1:
            print("Reading input DICOM files from directory %s" % (inputDirName))
        
        filenames = list()
        for [root, dirs, files] in os.walk(inputDirName):
            for f in files:
                fn = os.path.join(root, f)
                if fn.endswith('.dcm'):
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

    dicom_validation = is_dicom_3Dable(filenames)
    if not dicom_validation:
        print("DICOM Validation FAILED - 3Dable!! Exiting!!")
        sys.exit(0)
        
    output_n_slices = args.number_of_slices
    exceed_threshold = checkThreshold(filenames, output_n_slices)
    if not exceed_threshold:
        print("Series is within threshold. No further processing required!! Exiting!!")
        sys.exit(WITHIN_THRESHOLD)

    time0 = time.time()
    
    reader = RPDReadDICOM(working_directory = outputDirName,
                        verbose_level = args.verbose)
    reader.apply_rescale = False
        
    retcode1 = reader.read_from_list(filenames)
    
    if(reader.volume is None):
        print("DICOM data read error", file=sys.stderr)
        sys.exit(INPUT_DATA_NOT_READABLE)
    
    time1 = time.time()
    if args.verbose >= 2:
        print("Reading the data took %.1f seconds" % (time1-time0))
    
    
    sitk_volume = reader.volume
    
    gantry_tilt_correction_would_be_needed = reader.correctForGantryTilt(just_check_if_needed = True)
    if gantry_tilt_correction_would_be_needed == False:
        resultcode, thickness_info = reader.merge_half_and_full_thickness_slices(tolerance = 0.1)
        
    
    dcm_ds = reader.header1
    
    if 'NumberOfFrames' in dcm_ds:
        del dcm_ds.NumberOfFrames

    if [0x5200, 0x9229] in dcm_ds:
        del dcm_ds[0x5200, 0x9229]
    
    if [0x5200, 0x9230] in dcm_ds:
        del dcm_ds[0x5200, 0x9230]
        
    
    seriesUID_orig_ = ''
    seriesUID_orig = ''
    if hasattr(dcm_ds, "SeriesInstanceUID"):
        seriesUID_orig = str(dcm_ds.SeriesInstanceUID)
        seriesUID_orig_ = seriesUID_orig + "_"
    
    dcm_ds.SeriesDate = time.strftime("%Y%m%d")
    dcm_ds.SeriesTime = time.strftime("%H%M%S")
    
        
    sn = 0
    if hasattr(dcm_ds, "SeriesNumber"):
        s = str(dcm_ds.SeriesNumber)
        if s.isnumeric():
            sn = int(s)
    
    
    if args.series_number_offset is None:
        args.series_number_offset = 1
    
    if args.series_number_multiplier is None:
        if sn < 100:
            args.series_number_multiplier = 100
        else:
            args.series_number_multiplier = 10
    
    if args.series_number:
        sn = int(args.series_number)
    else:
        sn = sn * args.series_number_multiplier +  args.series_number_offset
   
    if args.verbose >= 3:
        print("Output series number will be %d" % (sn))
   
    sd = ''
    if hasattr(dcm_ds, 'SeriesDescription'):
        sd = str(dcm_ds.SeriesDescription)
    
    
    if args.series_description:
        sd = args.series_description
    
    if args.series_description_prefix:
        sd = args.series_description_prefix + sd
        
    if args.series_description_suffix:
        sd = sd + args.series_description_suffix
    
    if (not args.series_description) and \
       (not args.series_description_prefix) and \
       (not args.series_description_suffix):
           sd = sd + " (RAPID resampled to %d slices)" % (args.number_of_slices)

    if args.verbose >= 3:
        print("Output series description will be %s" % (sd))


    size1 = sitk_volume.GetSize()
    spacing1 = sitk_volume.GetSpacing()

    input_n_slices = size1[2]
    
    resampling_ratio = float(output_n_slices) / float(input_n_slices)
    
    # if resampling_ratio <= 0.5:
        
    #     merge_factor = int(np.floor(1.0 / resampling_ratio))
        
    #     if merge_factor >= 2:
    #         reader.merge_slices(merge_factor)
            
    #         sitk_volume = reader.volume
    #         size1 = sitk_volume.GetSize()
    #         spacing1 = sitk_volume.GetSpacing()
    
    #         input_n_slices = size1[2]
        
    
    new_spacing_z = float(input_n_slices) * spacing1[2] / float(output_n_slices)
    sitk_volume2 = None
    
    if output_n_slices < input_n_slices:

        if args.verbose >= 1:
            print("Resampling %d input slices to %d output slices ..." % (input_n_slices, output_n_slices))
        
        
        sitk_volume_temp = sitk_volume
        
        if (gantry_tilt_correction_would_be_needed == False) and (resampling_ratio <= 0.5):
            
            
            sigmaZ = spacing1[2] / resampling_ratio

            gaussianFilter = sitk.SmoothingRecursiveGaussianImageFilter()
            gaussianFilter.SetSigma([0.001, 0.001, sigmaZ])
            sitk_volume_temp = gaussianFilter.Execute(sitk_volume_temp)
                    
            
        
        new_spacing = [sitk_volume_temp.GetSpacing()[0],
                       sitk_volume_temp.GetSpacing()[1],
                       new_spacing_z]
                       
        new_size = [size1[0], 
                    size1[1],
                    output_n_slices]
        
        sitk_volume2 = sitk.Resample(sitk_volume_temp, 
                                  size = new_size,
                                  transform = sitk.Transform(),
                                  interpolator = sitk.sitkLinear,
                                  defaultPixelValue = -1024,
                                  outputOrigin = sitk_volume_temp.GetOrigin(), 
                                  outputSpacing = new_spacing, 
                                  outputPixelType = sitk_volume_temp.GetPixelID(),
                                  outputDirection = sitk_volume_temp.GetDirection())

    else:
        if args.verbose >= 1:
            print("Number of output slices specified (%d) is higher than the input number of slices (%d), data will not be resampled." % (input_n_slices, output_n_slices))
        sitk_volume2 = sitk_volume 
             

    time2 = time.time()
    if args.verbose >= 2:
        print("Data resampling took %.1f seconds" % (time2-time1))


    if args.verbose >= 1:
        print("Writing output DICOM data to %s" % (outputDirName))


    dcm_ds.SeriesNumber = str(sn)
    dcm_ds.SeriesInstanceUID = pydicom.uid.generate_uid(prefix=ISCHEMAVIEW_UID_PREFIX+".")
    dcm_ds.SeriesDescription = sd
    dcm_ds.FrameOfReferenceUID = seriesUID_orig
    dcm_ds.ImageType = "DERIVED\\SECONDARY\\INTERPOLATED\\" + str(int(input_n_slices)) + "\\" + str(int(output_n_slices))

    filenames2 = export_dicoms(sitk_volume2, 
                               dcm_ds, 
                               os.path.join(outputDirName, dcm_ds.SeriesInstanceUID),
                               args.verbose)

    time3 = time.time()
    if args.verbose >= 2:
        print("Data writing took %.1f seconds" % (time3-time2))

    if args.verbose >= 2:
        print("The whole data processing took %.1f seconds" % (time3-time0))

    if args.verbose >= 1:
        print("Done.")

        
    sys.exit(0)
