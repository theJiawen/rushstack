// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'fs';
import * as path from 'path';

import { type IRealNodeModulePathResolverOptions, RealNodeModulePathResolver } from '../RealNodeModulePath';

const mocklstatSync: jest.Mock<ReturnType<typeof fs.lstatSync>, Parameters<typeof fs.lstatSync>> = jest.fn();
const lstatSync: typeof fs.lstatSync = mocklstatSync as unknown as typeof fs.lstatSync;
const mockReadlinkSync: jest.Mock<
  ReturnType<typeof fs.readlinkSync>,
  Parameters<typeof fs.readlinkSync>
> = jest.fn();
const readlinkSync: typeof fs.readlinkSync = mockReadlinkSync as unknown as typeof fs.readlinkSync;

const mockFs: IRealNodeModulePathResolverOptions['fs'] = {
  lstatSync,
  readlinkSync
};

describe('realNodeModulePath', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('POSIX paths', () => {
    const resolver: RealNodeModulePathResolver = new RealNodeModulePathResolver({
      fs: mockFs,
      path: path.posix
    });
    const { realNodeModulePath } = resolver;

    beforeEach(() => {
      resolver.clearCache();
    });

    it('should return the input path if it does not contain node_modules', () => {
      for (const input of ['/foo/bar', '/', 'ab', '../foo/bar/baz']) {
        expect(realNodeModulePath(input)).toBe(input);

        expect(mocklstatSync).not.toHaveBeenCalled();
        expect(mockReadlinkSync).not.toHaveBeenCalled();
      }
    });

    it('should return the input path if it is not a symbolic link', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => false } as unknown as fs.Stats);

      expect(realNodeModulePath('/foo/node_modules/foo')).toBe('/foo/node_modules/foo');

      expect(mocklstatSync).toHaveBeenCalledWith('/foo/node_modules/foo');
      expect(mocklstatSync).toHaveBeenCalledTimes(1);
      expect(mockReadlinkSync).toHaveBeenCalledTimes(0);
    });

    it('Should handle absolute link targets', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('/link/target');

      expect(realNodeModulePath('/foo/node_modules/link')).toBe('/link/target');

      expect(mocklstatSync).toHaveBeenCalledWith('/foo/node_modules/link');
      expect(mocklstatSync).toHaveBeenCalledTimes(1);
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Caches resolved symlinks', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('/link/target');

      expect(realNodeModulePath('/foo/node_modules/link')).toBe('/link/target');
      expect(realNodeModulePath('/foo/node_modules/link/bar')).toBe('/link/target/bar');

      expect(mocklstatSync).toHaveBeenCalledWith('/foo/node_modules/link');
      expect(mocklstatSync).toHaveBeenCalledTimes(1);
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should stop after a single absolute link target', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('/link/target');

      expect(realNodeModulePath('/node_modules/foo/node_modules/link')).toBe('/link/target');

      expect(mocklstatSync).toHaveBeenCalledWith('/node_modules/foo/node_modules/link');
      expect(mocklstatSync).toHaveBeenCalledTimes(1);
      expect(mockReadlinkSync).toHaveBeenCalledWith('/node_modules/foo/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should handle relative link targets', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('../../link/target');

      expect(realNodeModulePath('/foo/node_modules/link')).toBe('/link/target');

      expect(mocklstatSync).toHaveBeenCalledWith('/foo/node_modules/link');
      expect(mocklstatSync).toHaveBeenCalledTimes(1);
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should recursively handle relative link targets', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('../../link');
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('/other/root/bar');

      expect(realNodeModulePath('/foo/1/2/3/node_modules/bar/node_modules/link/4/5/6')).toBe(
        '/other/root/link/4/5/6'
      );

      expect(mocklstatSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar/node_modules/link');
      expect(mocklstatSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar');
      expect(mocklstatSync).toHaveBeenCalledTimes(2);
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(2);
    });

    it('Caches multi-layer resolution', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('../../link');
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('/other/root/bar');

      expect(realNodeModulePath('/foo/1/2/3/node_modules/bar/node_modules/link/4/5/6')).toBe(
        '/other/root/link/4/5/6'
      );
      expect(realNodeModulePath('/foo/1/2/3/node_modules/bar/node_modules/link/a/b')).toBe(
        '/other/root/link/a/b'
      );
      expect(realNodeModulePath('/foo/1/2/3/node_modules/bar/a/b')).toBe('/other/root/bar/a/b');

      expect(mocklstatSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar/node_modules/link');
      expect(mocklstatSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar');
      expect(mocklstatSync).toHaveBeenCalledTimes(2);
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('Windows paths', () => {
    const resolver: RealNodeModulePathResolver = new RealNodeModulePathResolver({
      fs: mockFs,
      path: path.win32
    });
    const { realNodeModulePath } = resolver;

    beforeEach(() => {
      resolver.clearCache();
    });

    it('should return the input path if it does not contain node_modules', () => {
      for (const input of ['C:\\foo\\bar', 'C:\\', 'ab', '..\\foo\\bar\\baz']) {
        mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);

        expect(realNodeModulePath(input)).toBe(input);

        expect(mocklstatSync).not.toHaveBeenCalled();
        expect(mockReadlinkSync).not.toHaveBeenCalled();
      }
    });

    it('should return the normalized input path if it does not contain node_modules', () => {
      for (const input of ['C:/foo/bar', 'C:/', 'ab', '../foo/bar/baz']) {
        mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);

        expect(realNodeModulePath(input)).toBe(path.win32.normalize(input));

        expect(mocklstatSync).not.toHaveBeenCalled();
        expect(mockReadlinkSync).not.toHaveBeenCalled();
      }
    });

    it('Should return the input path if the target is not a symbolic link', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => false } as unknown as fs.Stats);

      expect(realNodeModulePath('C:\\foo\\node_modules\\foo')).toBe('C:\\foo\\node_modules\\foo');

      expect(mocklstatSync).toHaveBeenCalledWith('C:\\foo\\node_modules\\foo');
      expect(mocklstatSync).toHaveBeenCalledTimes(1);
      expect(mockReadlinkSync).toHaveBeenCalledTimes(0);
    });

    it('Should handle absolute link targets', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('C:\\link\\target');

      expect(realNodeModulePath('C:\\foo\\node_modules\\link')).toBe('C:\\link\\target');

      expect(mocklstatSync).toHaveBeenCalledWith('C:\\foo\\node_modules\\link');
      expect(mocklstatSync).toHaveBeenCalledTimes(1);
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\foo\\node_modules\\link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should normalize input', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('C:\\link\\target');

      expect(realNodeModulePath('C:\\foo\\node_modules\\link')).toBe('C:\\link\\target');

      expect(mocklstatSync).toHaveBeenCalledWith('C:\\foo\\node_modules\\link');
      expect(mocklstatSync).toHaveBeenCalledTimes(1);
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\foo\\node_modules\\link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should stop after a single absolute link target', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('D:\\link\\target');

      expect(realNodeModulePath('C:\\node_modules\\foo\\node_modules\\link')).toBe('D:\\link\\target');

      expect(mocklstatSync).toHaveBeenCalledWith('C:\\node_modules\\foo\\node_modules\\link');
      expect(mocklstatSync).toHaveBeenCalledTimes(1);
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\node_modules\\foo\\node_modules\\link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should handle relative link targets', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('..\\..\\link\\target');

      expect(realNodeModulePath('C:\\foo\\node_modules\\link')).toBe('C:\\link\\target');

      expect(mocklstatSync).toHaveBeenCalledWith('C:\\foo\\node_modules\\link');
      expect(mocklstatSync).toHaveBeenCalledTimes(1);
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\foo\\node_modules\\link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should recursively handle relative link targets', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('..\\..\\link');
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('D:\\other\\root\\bar');

      expect(realNodeModulePath('C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link\\4\\5\\6')).toBe(
        'D:\\other\\root\\link\\4\\5\\6'
      );

      expect(mocklstatSync).toHaveBeenCalledWith('C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link');
      expect(mocklstatSync).toHaveBeenCalledWith('C:\\foo\\1\\2\\3\\node_modules\\bar');
      expect(mocklstatSync).toHaveBeenCalledTimes(2);
      expect(mockReadlinkSync).toHaveBeenCalledWith(
        'C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link',
        'utf8'
      );
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\foo\\1\\2\\3\\node_modules\\bar', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(2);
    });

    it('Caches multi-layer resolution', () => {
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('..\\..\\link');
      mocklstatSync.mockReturnValueOnce({ isSymbolicLink: () => true } as unknown as fs.Stats);
      mockReadlinkSync.mockReturnValueOnce('D:\\other\\root\\bar');

      expect(realNodeModulePath('C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link\\4\\5\\6')).toBe(
        'D:\\other\\root\\link\\4\\5\\6'
      );
      expect(realNodeModulePath('C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link\\a\\b')).toBe(
        'D:\\other\\root\\link\\a\\b'
      );
      expect(realNodeModulePath('C:\\foo\\1\\2\\3\\node_modules\\bar\\a\\b')).toBe(
        'D:\\other\\root\\bar\\a\\b'
      );

      expect(mocklstatSync).toHaveBeenCalledWith('C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link');
      expect(mocklstatSync).toHaveBeenCalledWith('C:\\foo\\1\\2\\3\\node_modules\\bar');
      expect(mocklstatSync).toHaveBeenCalledTimes(2);
      expect(mockReadlinkSync).toHaveBeenCalledWith(
        'C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link',
        'utf8'
      );
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\foo\\1\\2\\3\\node_modules\\bar', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(2);
    });
  });
});