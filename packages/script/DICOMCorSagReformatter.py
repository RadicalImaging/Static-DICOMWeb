# -*- coding: utf-8 -*-
"""
Created on Thu Dec 22 11:31:48 2022

@author: matus
"""

import os, sys, time
import pydicom
import numpy as np
import SimpleITK as sitk
import argparse

ISCHEMAVIEW_UID_PREFIX = "1.3.6.1.4.1.39822"


def load_dicoms(filelist): # returns volume, and pydicom header/ds

    sortdict = dict()
    filecount = 0
    
    rows = None
    columns = None    

    for fn in filelist:
        
        ds = pydicom.dcmread(fn, stop_before_pixels = True)
        if hasattr(ds, "InstanceNumber"):
            s = str(ds.InstanceNumber)
            if s.isnumeric():
                inbr = int(ds.InstanceNumber)
                sortdict[inbr] = fn
            else:
                print("File %s have InstanceNumber tag value '%s' which is not numeric" % (fn, s))
        else:
            print("File %s has no InstanceNumber tag, exiting" % (fn))

        filecount = filecount + 1
        
        if rows is None:
            if hasattr(ds, "Rows"):
                rows = ds.Rows
        if columns is None:
            if hasattr(ds, "Columns"):
                columns = ds.Columns
                

        
    ordering = sorted(sortdict.keys())
    data = np.zeros([filecount, rows, columns], dtype = np.int16)
    dcm_ds = None

    
    spacing = None
    ipp1 = None
    ipp2 = None
    iop = None
    iop1 = None
    iop2 = None
    iop3 = None
    
    for idx in range(len(ordering)):
        
        fn = sortdict[ordering[idx]]
        print("Reading %s" % (fn))
        ds = pydicom.dcmread(fn)
        data[idx, :, :] = ds.pixel_array[:,:]
        
        if dcm_ds is None:
            dcm_ds = ds

        if spacing  is None:
            if hasattr(ds, "PixelSpacing"):
                spA = getattr(ds, 'PixelSpacing')
                if len(spA) == 2:
                    spA = list(map(float, spA))
                    spacing = spA + [1.0]
                    

        if hasattr(ds, 'ImagePositionPatient'):
            if ipp1 is None:
                ipp1 = np.asarray(ds.ImagePositionPatient)
            elif ipp2 is None:
                ipp2 = np.asarray(ds.ImagePositionPatient)

        if hasattr(ds, 'ImageOrientationPatient'):
            iop = ds.ImageOrientationPatient
            #iop = getattr(dcm1, 'ImageOrientationPatient')
            iop1 = np.array(iop[0:3])
            iop2 = np.array(iop[3:6])
            iop3 = np.cross(iop1, iop2)
        
          
    dif = np.linalg.norm(ipp2 - ipp1)
    
    spacing[2] = dif

    sitk_volume = sitk.GetImageFromArray(data)
    sitk_volume.SetSpacing(spacing)
    sitk_volume.SetOrigin(ipp1)
    
    volume_direction = np.zeros((3,3), dtype=float)
    volume_direction[:,0] = iop1
    volume_direction[:,1] = iop2
    volume_direction[:,2] = iop3
    
    sitk_volume.SetDirection(volume_direction.reshape(9).tolist())
    
    return sitk_volume, dcm_ds
        



def export_dicoms(sitk_volume,
                  dcm_ds,
                  fn_prefix):
    
    size1 = sitk_volume.GetSize()
                    
    filenames = []
    n_colors = sitk_volume.GetNumberOfComponentsPerPixel()        
  
    
    rescale_slope = 1.0
    if(hasattr(dcm_ds, 'RescaleSlope')):
        rescale_slope = getattr(dcm_ds, 'RescaleSlope')
               
    rescale_intercept = 0.0
    if(hasattr(dcm_ds, 'RescaleIntercept')):
        rescale_intercept = getattr(dcm_ds, 'RescaleIntercept')
    
    
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
            
            print("Writing %s" % (fn))
            
            pydicom.dcmwrite(fn, ds, write_like_original=False)
        
            filenames.append(fn)
            instance_nr = instance_nr + 1
    else:
        print("Don't know how to export RGB DICOMs yet!", file=sys.stderr)
        raise
        
    return filenames




if __name__ == "__main__":
    
    parser = argparse.ArgumentParser(
        prog = "DICOMCorSagReformatter",
        description="Reads transverse DICOM series and reformats to coronal and sagittal views in DICOM format. (c) 2022-23 iSchemaView, Inc.")
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
        "-flipZ",
        help="flip the input (transverse) data vertically before generating the coronal and sagittal reformats",
        default = False,
        action='store_true'
    )
    args = parser.parse_args()

    # current directory by default
    inputDirName = args.input_directory

    outputDirName = inputDirName
    if args.output_directory:
        outputDirName = args.output_directory
        
    if not os.path.exists(outputDirName):
        os.makedirs(outputDirName)
    
    filenames = list()
    for [root, dirs, files] in os.walk(inputDirName):
        for f in files:
            fn = os.path.join(root, f)
            filenames.append(fn)
        break

    sitk_volume, dcm_ds = load_dicoms(filenames)
    
    seriesUID_orig_ = ''
    if hasattr(dcm_ds, "SeriesInstanceUID"):
        seriesUID_orig_ = str(dcm_ds.SeriesInstanceUID) + "_"
    
    dcm_ds.SeriesDate = time.strftime("%Y%m%d")
    dcm_ds.SeriesTime = time.strftime("%H%M%S")
    
    sn = 0
    if hasattr(dcm_ds, "SeriesNumber"):
        s = str(dcm_ds.SeriesNumber)
        if s.isnumeric():
            v = int(dcm_ds.SeriesNumber)
            if (v < 10):
                sn = sn * 100
            else:
                sn = sn * 10
   
    sd = ''
    if hasattr(dcm_ds, 'SeriesDescription'):
        sd = str(dcm_ds.SeriesDescription)
    
    
    # now do the reformats:
    # coronal reformat

    if args.flipZ:
       sitk_volume = sitk.Flip(sitk_volume, [False, False, True])
       
    sitk_volume_cor = sitk.PermuteAxes(sitk_volume, [0,2,1])
    
    size1 = sitk_volume_cor.GetSize()
    spacing1 = sitk_volume_cor.GetSpacing()
    
    new_spacing = [sitk_volume.GetSpacing()[0],
                   sitk_volume.GetSpacing()[0],
                   sitk_volume.GetSpacing()[2]]
                   
    new_size = [int(np.round(size1[0] / new_spacing[0] * spacing1[0])),
                int(np.round(size1[1] / new_spacing[1] * spacing1[1])),
                int(np.round(size1[2] / new_spacing[2] * spacing1[2])),]
    
    sitk_volume_cor2 = sitk.Resample(sitk_volume_cor, 
                              size = new_size,
                              transform = sitk.Transform(),
                              interpolator = sitk.sitkLinear,
                              defaultPixelValue = 0,
                              outputOrigin = sitk_volume_cor.GetOrigin(), 
                              outputSpacing = new_spacing, 
                              outputPixelType = sitk_volume_cor.GetPixelID(),
                              outputDirection = sitk_volume_cor.GetDirection())
    
    
    sn =  sn  + 1
    dcm_ds.SeriesNumber = str(sn)
    dcm_ds.SeriesInstanceUID = pydicom.uid.generate_uid(prefix=ISCHEMAVIEW_UID_PREFIX+".")
    dcm_ds.SeriesDescription = sd + " (coronal reformat)"

    filenames2 = export_dicoms(sitk_volume_cor2, dcm_ds, os.path.join(outputDirName, seriesUID_orig_ + "cor"))


    # sagittal reformat
    sitk_volume_sag = sitk.PermuteAxes(sitk_volume, [1,2,0])
    
    size1 = sitk_volume_sag.GetSize()
    spacing1 = sitk_volume_sag.GetSpacing()
    
    new_spacing = [sitk_volume.GetSpacing()[0],
                   sitk_volume.GetSpacing()[0],
                   sitk_volume.GetSpacing()[2]]
                   
    new_size = [int(np.round(size1[0] / new_spacing[0] * spacing1[0])),
                int(np.round(size1[1] / new_spacing[1] * spacing1[1])),
                int(np.round(size1[2] / new_spacing[2] * spacing1[2])),]
    
    sitk_volume_sag2 = sitk.Resample(sitk_volume_sag, 
                              size = new_size,
                              transform = sitk.Transform(),
                              interpolator = sitk.sitkLinear,
                              defaultPixelValue = 0,
                              outputOrigin = sitk_volume_sag.GetOrigin(), 
                              outputSpacing = new_spacing, 
                              outputPixelType = sitk_volume_sag.GetPixelID(),
                              outputDirection = sitk_volume_sag.GetDirection())
    
    sn =  sn  + 1
    dcm_ds.SeriesNumber = str(sn)
    dcm_ds.SeriesInstanceUID = pydicom.uid.generate_uid(prefix=ISCHEMAVIEW_UID_PREFIX+".")
    dcm_ds.SeriesDescription = sd + " (sagittal reformat)"

    filenames2 = export_dicoms(sitk_volume_sag2, dcm_ds, os.path.join(outputDirName, seriesUID_orig_ + "sag"))
    
    print("Done.")