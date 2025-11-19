# Serve Static DICOMweb files off Nginx HTTP/Web Server 

This is an example of how a Static DICOMweb dataset can be hosted on a Nginx server to be integrated with a DICOMweb-enabled viewer, such as [OHIF](https://ohif.org/).

## Notes
1. Thanks to [Bill Wallace](https://github.com/wayfarer3130) for helping with this 🙏
2. This may or may not be the best, most performant, etc. way to do to this. It is only intended as a reference.
3. This assumed you have your Static DICOMweb dataset placed at `/usr/share/nginx/html/dicomweb`


# Nginx Configuration

```
events {}

http {
  include       mime.types;
  default_type  application/octet-stream;
  
  types {
        application/javascript   js mjs;
        text/css                 css;
        application/json         json;
        application/wasm         wasm;
        image/svg+xml            svg;
    }
  
  server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    autoindex on;
    autoindex_exact_size off;  # Show human-readable sizes
    autoindex_localtime on;    # Show file modification times

    location / {
      try_files $uri $uri/ /index.html /index.json.gz =404;
    }
    
    location ~ ^/dicomweb/studies$ {
      types { application/json json; }
      add_header 'Content-Encoding' 'gzip';
      default_type application/json;
      try_files /dicomweb/studies/index.json.gz =204;
    }
    
    location ~ ^/dicomweb/studies/([0-9.]+)$ {
      add_header 'Content-Encoding' 'gzip';
      default_type application/json;
      try_files /dicomweb/studies/$1/index.json.gz =204;
    }
    
    location ~ ^/dicomweb/studies/([0-9.]+)/series$ {
      add_header 'Content-Encoding' 'gzip';
      default_type application/json;
      try_files /dicomweb/studies/$1/series/index.json.gz =204;
    }
    
    location ~ ^/dicomweb/studies/([0-9.]+)/series/([0-9.]+)$ {
      add_header 'Content-Encoding' 'gzip';
      default_type application/json;
      try_files /dicomweb/studies/$1/series/$2/index.json.gz =204;
    }
    
    location ~ ^/dicomweb/studies/([0-9.]+)/series/([0-9.]+)/metadata$ {
      add_header 'Content-Encoding' 'gzip';
      default_type application/json;
      try_files /dicomweb/studies/$1/series/$2/metadata.gz =204;
    }
    
    location ~ ^/dicomweb/studies/([0-9.]+)/series/([0-9.]+)/instances/([0-9.]+)/$ {
      add_header 'Content-Encoding' 'gzip';
      default_type multipart/related;
      try_files /dicomweb/studies/$1/series/$2/instances/$3/frames/$4 /dicomweb/studies/$1/series/$2/instances/$3/index.mht.gz =404;
    }
    
    location ~ ^/dicomweb/studies/([0-9.]+)/series/([0-9.]+)/instances/([0-9.]+)/frames/([0-9]+)$ {
      default_type multipart/related;
      try_files /dicomweb/studies/$1/series/$2/instances/$3/frames/$4 /dicomweb/studies/$1/series/$2/instances/$3/frames/$4.mht =404;
    }
    
    location ~ ^/dicomweb/studies/([0-9.]+)/series/([0-9.]+)/instances/([0-9.]+)/rendered/$ {
      try_files /dicomweb/studies/$1/series/$2/instances/$3/rendered/index.mp4 =404;
    }
  }
}

```
