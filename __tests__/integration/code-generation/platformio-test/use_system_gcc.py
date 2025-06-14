# __tests__/integration/code-generation/platformio-test/use_system_gcc.py
Import("env")
import os

# Use system compilers in WSL
env.Replace(
    CC="/usr/bin/gcc",
    CXX="/usr/bin/g++",
    AR="/usr/bin/ar",
    RANLIB="/usr/bin/ranlib",
    LINK="/usr/bin/g++"
)

# Ensure paths are correct
env.PrependENVPath("PATH", "/usr/bin")