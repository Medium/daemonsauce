{
  "targets": [
    {
      "target_name": "daemonsauceNative",
      "sources": [ "src/daemonsauceNative.cc" ],
      "include_dirs" : [
        "<!(node -e \"require('nan')\")"
      ]
    }
  ]
}
